<?php
namespace A7Radios;
defined('ABSPATH') || exit;

function public_name_fields(string $name): array {
    $parts = preg_split('/\s+/u', $name, -1, PREG_SPLIT_NO_EMPTY);
    return ['display_name' => $name, 'nickname' => $name] + (count($parts) === 2 ?
        ['first_name' => $parts[0], 'last_name' => $parts[1]] : []);
}

function account_lock(string $key, callable $operation): array|\WP_Error {
    global $wpdb;
    $lock = hash('sha256', $wpdb->options . ':a7r-account:' . $key);
    if ((int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 4)', $lock)) !== 1) {
        return err('Aguarde e tente novamente.', 409);
    }
    try { return $operation(); }
    finally { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock)); }
}

function valid_email_input(string $value): bool {
    return strlen($value) <= 100 && is_email($value) && sanitize_email($value) === $value;
}

function send_confirmation(string $key, array $record): array|\WP_Error {
    $secret = bin2hex(random_bytes(32));
    $record['token'] = hash('sha256', $secret);
    $record['expires'] = time() + DAY_IN_SECONDS;
    $previous = get_option($key);
    if (!update_option($key, $record, false)) return err('Não foi possível registrar a confirmação.', 503);
    // The fragment stays out of HTTP access logs and Referer headers.
    $url = origin() . '/confirmar-email/#' . substr($key, strlen('a7r_confirmation_')) . '.' . $secret;
    if (!wp_mail($record['email'], 'Confirme seu e-mail na A7 Rádios', "Abra o link em até 24 horas para confirmar seu e-mail:\n\n" . $url)) {
        if ($previous) update_option($key, $previous, false);
        else delete_option($key);
        return err('O e-mail não pôde ser enviado agora. Aguarde um minuto e tente novamente.', 503);
    }
    return ['message' => 'Enviamos um link de confirmação para o endereço informado.'];
}

function registration_confirmation(string $email, string $name = '', string $password = ''): array|\WP_Error {
    $key = 'a7r_confirmation_r.' . hash_hmac('sha256', strtolower($email), wp_salt('nonce'));
    return account_lock('email:' . strtolower($email), static function () use ($email, $name, $password, $key) {
        if (email_exists($email)) return err('Este e-mail já está cadastrado.', 409, 'email');
        wp_cache_delete($key, 'options');
        wp_cache_delete('notoptions', 'options');
        $pending = get_option($key);
        if ($password !== '' && is_array($pending) && $pending['expires'] + DAY_IN_SECONDS >= time()) {
            return err('Já existe uma confirmação pendente. Use Reenviar confirmação.', 409, 'email');
        }
        if ($password !== '') $pending = ['email' => $email, 'name' => $name, 'passwordHash' => wp_hash_password($password)];
        if (!is_array($pending) || ($pending['expires'] ?? PHP_INT_MAX) + DAY_IN_SECONDS < time()) {
            return err('Cadastro pendente indisponível. Preencha o cadastro novamente.', 404, 'email');
        }
        if (!permit('confirm-email', strtolower($email), 1, 60)) return err('Aguarde um minuto antes de solicitar outro e-mail.', 429, 'email');
        return send_confirmation($key, $pending);
    });
}

function confirm_address(string $token): array|\WP_Error {
    if (!preg_match('/^((?:r|e)\.[a-f0-9]{64})\.([a-f0-9]{64})$/D', $token, $match)) return err('Link de confirmação inválido.', 400);
    $key = 'a7r_confirmation_' . $match[1];
    $candidate = get_option($key);
    if (!is_array($candidate)) return err('Link inválido ou já utilizado.', 400);
    $activate = static function () use ($candidate, $key, $match) {
        return account_lock('email:' . strtolower($candidate['email']), static function () use ($candidate, $key, $match) {
            wp_cache_delete($key, 'options');
            $record = get_option($key);
            if (!is_array($record) || $record['email'] !== $candidate['email'] ||
            !hash_equals($record['token'], hash('sha256', $match[2]))) return err('Link inválido ou já utilizado.', 400);
            if ($record['expires'] < time()) return err('O link expirou. Solicite um novo link de confirmação.', 410);
            if (email_exists($record['email'])) return err('Este e-mail já está cadastrado.', 409);
            if (isset($record['user'])) {
            $user = get_userdata($record['user']);
            if (!$user || $user->user_email !== $record['previous']) return err('O endereço da conta mudou. Solicite a alteração novamente.', 409);
            // WordPress sends its standard notification to the previous address.
            $result = wp_update_user(['ID' => $user->ID, 'user_email' => $record['email']]);
            } else {
            $login = 'a7r_' . bin2hex(random_bytes(12));
            $hash = static function ($data, $update) use ($record, $login) {
                if (!$update && $data['user_login'] === $login) $data['user_pass'] = $record['passwordHash'];
                return $data;
            };
            add_filter('wp_pre_insert_user_data', $hash, 10, 2);
            try {
                $result = wp_insert_user(['user_login' => $login, 'user_email' => $record['email'],
                    'user_pass' => wp_generate_password(32, true, true), 'role' => 'a7r_owner'] + public_name_fields($record['name']));
            } finally { remove_filter('wp_pre_insert_user_data', $hash, 10); }
            }
            if (is_wp_error($result)) return err('Não foi possível confirmar o endereço agora.', 503);
            delete_option($key);
            return ['message' => 'E-mail confirmado.', 'emailChange' => isset($record['user'])];
        });
    };
    return isset($candidate['user']) ? account_lock('profile:' . $candidate['user'], $activate) : $activate();
}

function profile_key(int $id): string {
    return 'a7r_confirmation_e.' . hash_hmac('sha256', (string) $id, wp_salt('nonce'));
}

function owner_profile(): array {
    $user = get_userdata(get_current_user_id());
    $pending = get_option(profile_key($user->ID));
    return ['name' => $user->display_name, 'email' => $user->user_email,
        'pendingEmail' => ($pending['expires'] ?? 0) > time() ? $pending['email'] : null];
}

function update_profile(\WP_REST_Request $request): array|\WP_Error {
    $id = get_current_user_id();
    $name = request_text($request, 'name', 80);
    $email = is_string($request['email']) ? trim($request['email']) : '';
    if (is_wp_error($name)) return $name;
    if (!valid_email_input($email)) return err('Informe um e-mail válido.', 422, 'email');
    return account_lock('profile:' . $id, static function () use ($id, $name, $email) {
        $user = get_userdata($id);
        $key = profile_key($id);
        $pending = get_option($key);
        if (strcasecmp($user->user_email, $email) !== 0 &&
            ($email !== ($pending['email'] ?? '') || ($pending['expires'] ?? 0) <= time())) {
            if (email_exists($email)) return err('Este e-mail já está cadastrado.', 409, 'email');
            if (!permit('profile-email', (string) $id, 3, HOUR_IN_SECONDS)) return err('Aguarde antes de solicitar outra confirmação.', 429, 'email');
            $result = send_confirmation($key, ['email' => $email, 'user' => $id, 'previous' => $user->user_email]);
            if (is_wp_error($result)) return $result;
        }
        if ($name !== $user->display_name) {
            $result = wp_update_user(['ID' => $id] + public_name_fields($name));
            if (is_wp_error($result)) return err('Não foi possível salvar o nome.', 503, 'name');
        }
        return owner_profile();
    });
}

add_action('a7r_cleanup_limits', static function () {
    global $wpdb;
    $prefix = $wpdb->esc_like('a7r_confirmation_') . '%';
    $keys = $wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s LIMIT 500", $prefix));
    foreach ($keys as $key) {
        $record = get_option($key);
        if (($record['expires'] ?? 0) + DAY_IN_SECONDS >= time()) continue;
        if (!is_array($record) || empty($record['email'])) continue;
        account_lock('email:' . strtolower($record['email']), static function () use ($key, $record) {
            wp_cache_delete($key, 'options');
            if (get_option($key) === $record) delete_option($key);
            return [];
        });
    }
});
