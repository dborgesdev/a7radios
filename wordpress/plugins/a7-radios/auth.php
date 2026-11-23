<?php
namespace A7Radios;
defined('ABSPATH') || exit;

foreach (['session', 'login', 'register', 'recover', 'reset', 'logout'] as $action) {
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
    $user = wp_signon(['user_login' => $email, 'user_password' => $password, 'remember' => false], is_ssl());
    if (is_wp_error($user)) fail_ajax('E-mail ou senha inválidos.', 401);
    wp_send_json(['message' => 'Sessão iniciada.']);
}

function ajax_register(): void {
    auth_gate('register', 6);
    if (!registration_enabled()) fail_ajax('Cadastro indisponível.', 403);
    $email = sanitize_email(form_value('email'));
    $name = sanitize_text_field(form_value('name'));
    $password = form_value('password');
    if (!is_email($email) || strlen($email) > 100 || !$name || strlen($name) > 240 || !valid_password($password)) {
        fail_ajax('Confira o nome, e-mail e a senha de pelo menos 12 caracteres.', 422);
    }
    if (permit('register-account', strtolower($email), 1, 900) && !email_exists($email)) {
        $created = wp_insert_user([
            'user_login' => 'a7r_' . bin2hex(random_bytes(12)), 'user_email' => $email,
            'user_pass' => $password, 'display_name' => $name, 'role' => 'a7r_owner',
        ]);
        if (is_wp_error($created) && $created->get_error_code() !== 'existing_user_email') {
            fail_ajax('Cadastro temporariamente indisponível.', 503);
        }
    }
    wp_send_json(['message' => 'Se o cadastro estiver disponível para este e-mail, você já pode entrar.']);
}

function valid_password(string $password): bool {
    return strlen($password) >= 12 && strlen($password) <= 128 && trim($password) === $password;
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
    if (!valid_password($password)) fail_ajax('Use uma senha de 12 a 128 caracteres, sem espaços nas pontas.', 422);
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
