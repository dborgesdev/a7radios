<?php
namespace A7Radios;
defined('ABSPATH') || exit;

foreach (['session', 'login', 'register', 'recover', 'reset', 'logout', 'confirm', 'resend'] as $action) {
    add_action('wp_ajax_a7r_' . $action, __NAMESPACE__ . '\\ajax_' . $action);
    add_action('wp_ajax_nopriv_a7r_' . $action, __NAMESPACE__ . '\\ajax_' . $action);
}

function form_value(string $key): string {
    return isset($_POST[$key]) && is_string($_POST[$key]) ? wp_unslash($_POST[$key]) : '';
}

function fail_ajax(string $message, int $status): never {
    wp_send_json(['message' => $message], $status);
}

function registration_enabled(): bool {
    return !is_multisite() && defined('A7R_REGISTRATION') && A7R_REGISTRATION;
}

function ajax_session(): void {
    no_store();
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET' ||
        (isset($_SERVER['HTTP_ORIGIN']) && !same_origin()) ||
        (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && !in_array($_SERVER['HTTP_SEC_FETCH_SITE'], ['same-origin', 'none'], true))) {
        fail_ajax('Origem não autorizada.', 403);
    }
    $user = wp_get_current_user();
    $csrf = $_COOKIE['a7r_csrf'] ?? '';
    if (!is_string($csrf) || !preg_match('/^[a-f0-9]{64}$/D', $csrf)) {
        $csrf = bin2hex(random_bytes(32));
        setcookie('a7r_csrf', $csrf, [
            'path' => wp_parse_url(admin_url('admin-ajax.php'), PHP_URL_PATH), 'httponly' => true,
            'secure' => is_ssl(), 'samesite' => 'Strict',
        ]);
    }
    $response = ['authenticated' => $user->exists(), 'csrf' => $csrf, 'registration' => registration_enabled()];
    if ($user->exists()) {
        $response['nonce'] = wp_create_nonce('wp_rest');
        $response['user'] = ['id' => $user->ID, 'name' => $user->display_name, 'canSubmit' => current_user_can('a7r_submit')];
    }
    wp_send_json($response);
}

function auth_gate(string $action, int $limit, bool $logged_in = false): void {
    no_store();
    $token = $_COOKIE['a7r_csrf'] ?? '';
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !same_origin() ||
        !is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token) || !hash_equals($token, form_value('csrf'))) {
        fail_ajax('Sessão do formulário inválida. Atualize a página.', 403);
    }
    if (is_user_logged_in() !== $logged_in) fail_ajax('Sessão inválida para esta ação.', 403);
    if (!permit('auth:' . $action, ip(), $limit, 900)) fail_ajax('Muitas tentativas. Aguarde alguns minutos.', 429);
}

function ajax_login(): void {
    auth_gate('login', 20);
    $email = trim(form_value('email'));
    $password = form_value('password');
    if (!is_email($email) || strlen($password) > 512 || !permit('login-account', strtolower($email), 12, 900)) {
        fail_ajax('E-mail ou senha inválidos.', 401);
    }
    $pending_key = 'a7r_confirmation_r.' . hash_hmac('sha256', strtolower($email), wp_salt('nonce'));
    $pending = get_option($pending_key);
    if (!email_exists($email) && is_array($pending) && wp_check_password($password, $pending['passwordHash'])) {
        reply_account(err('Confirme seu e-mail antes de entrar.', 403, 'email'));
    }
    $user = wp_signon(['user_login' => $email, 'user_password' => $password, 'remember' => false], is_ssl());
    if (is_wp_error($user)) fail_ajax('E-mail ou senha inválidos.', 401);
    wp_send_json(['message' => 'Sessão iniciada.']);
}

function reply_account(array|\WP_Error $result): never {
    if (is_wp_error($result)) wp_send_json(['message' => $result->get_error_message(), 'data' => $result->get_error_data()], $result->get_error_data()['status']);
    wp_send_json($result);
}

function ajax_register(): void {
    auth_gate('register', 6);
    if (!registration_enabled()) fail_ajax('Cadastro indisponível.', 403);
    $email = trim(form_value('email'));
    $name = sanitize_text_field(form_value('name'));
    $password = form_value('password');
    if (!valid_email_input($email)) reply_account(err('Informe um e-mail válido.', 422, 'email'));
    if (!$name || !preg_match('/^.{1,80}$/usD', $name)) reply_account(err('Informe o nome público com até 80 caracteres.', 422, 'name'));
    if ($failure = password_error($password)) reply_account(err($failure, 422, 'password'));
    reply_account(registration_confirmation($email, $name, $password));
}

function ajax_resend(): void {
    auth_gate('resend', 5);
    if (!registration_enabled()) fail_ajax('Cadastro indisponível.', 403);
    $email = trim(form_value('email'));
    if (!valid_email_input($email)) reply_account(err('Informe um e-mail válido.', 422, 'email'));
    reply_account(registration_confirmation($email));
}

function ajax_confirm(): void {
    no_store();
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !same_origin() || !permit('auth:confirm', ip(), 20, 900)) {
        fail_ajax('A confirmação está indisponível. Aguarde e tente novamente.', 403);
    }
    reply_account(confirm_address(form_value('token')));
}

function password_error(string $password): ?string {
    if (!preg_match('/^.{8,128}$/usD', $password) || strlen($password) > 512) return 'Use de 8 a 128 caracteres.';
    if (trim($password) !== $password) return 'Retire os espaços no início ou no final da senha.';
    if (!preg_match('/\p{Lu}/u', $password)) return 'Inclua uma letra maiúscula.';
    if (!preg_match('/\p{Ll}/u', $password)) return 'Inclua uma letra minúscula.';
    if (!preg_match('/[0-9]/', $password)) return 'Inclua um número.';
    if (!preg_match('/[\p{P}\p{S}]/u', $password)) return 'Inclua um caractere especial.';
    return null;
}

function ajax_recover(): void {
    auth_gate('recover', 8);
    $email = sanitize_email(form_value('email'));
    if (is_email($email) && permit('recover-account', strtolower($email), 3, 3600)) {
        // Keep the WP reset key/expiry and mail transport. Only customize the portal URL.
        $message = static function ($original, $key, $login) {
            $url = origin() . '/recuperar-senha/?' . http_build_query(['key' => $key, 'login' => $login], '', '&', PHP_QUERY_RFC3986);
            return "Caso tenha solicitado a redefinição de senha na A7 Rádios, acesse:\n\n" . $url;
        };
        add_filter('retrieve_password_message', $message, 10, 3);
        retrieve_password($email);
        remove_filter('retrieve_password_message', $message, 10);
    }
    wp_send_json(['message' => 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.']);
}

function ajax_reset(): void {
    auth_gate('reset', 12);
    $password = form_value('password');
    if ($failure = password_error($password)) reply_account(err($failure, 422, 'password'));
    $user = check_password_reset_key(form_value('key'), form_value('login'));
    if (is_wp_error($user)) fail_ajax('Link de recuperação inválido ou expirado.', 400);
    reset_password($user, $password);
    wp_send_json(['message' => 'Senha atualizada. Você já pode entrar.']);
}

function ajax_logout(): void {
    auth_gate('logout', 30, true);
    wp_logout();
    wp_send_json(['message' => 'Sessão encerrada.']);
}

function redirect_owner_admin(): void {
    if (!wp_doing_ajax() && ($GLOBALS['pagenow'] ?? '') !== 'admin-post.php' && !current_user_can('a7r_moderate') && in_array('a7r_owner', wp_get_current_user()->roles, true)) {
        wp_safe_redirect(origin() . '/painel/');
        exit;
    }
}
add_action('admin_init', __NAMESPACE__ . '\redirect_owner_admin');
add_action('admin_page_access_denied', __NAMESPACE__ . '\redirect_owner_admin');
