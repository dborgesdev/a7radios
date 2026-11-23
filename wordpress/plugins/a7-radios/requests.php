<?php
namespace A7Radios;
defined('ABSPATH') || exit;

function request_text(\WP_REST_Request $request, string $field, int $limit, bool $multiline = false): string|\WP_Error {
    $raw = $request[$field] ?? '';
    $value = is_string($raw) ? ($multiline ? sanitize_textarea_field($raw) : sanitize_text_field($raw)) : '';
    if ($value === '' || (function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value)) > $limit) return err('Preencha este campo dentro do limite de ' . $limit . ' caracteres.', 422, $field);
    return $value;
}

function save_request(string $type, string $id, array $data): bool {
    global $wpdb;
    return 1 === $wpdb->query($wpdb->prepare(
        "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'off')",
        'a7r_queue_' . $type . '_' . $id,
        wp_json_encode($data + ['status' => 'pending', 'submitted' => gmdate(DATE_ATOM)])
    ));
}

function suggest_category(\WP_REST_Request $request): \WP_REST_Response|\WP_Error {
    $owner = get_current_user_id();
    if (!permit('category_suggestion', (string) $owner, 5, HOUR_IN_SECONDS)) return err('Aguarde antes de enviar outra sugestão.', 429);
    $name = request_text($request, 'name', 80);
    if (is_wp_error($name)) return $name;
    $name = preg_replace('/\s+/u', ' ', trim($name));
    $slug = sanitize_title($name);
    if (!$slug || term_exists($slug, 'a7_radio_category')) return err('Essa categoria já existe ou o nome é inválido.', 409);
    if (!save_request('category', hash('sha256', $slug), ['name' => $name, 'slug' => $slug, 'owner' => $owner])) {
        return err('Já existe uma solicitação para esse nome ou o envio está indisponível.', 409);
    }
    return new \WP_REST_Response(['message' => 'Sugestão registrada para análise.', 'id' => hash('sha256', $slug), 'name' => $name], 201);
}

function request_record(string $type, string $id): ?array {
    global $wpdb;
    $value = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", 'a7r_queue_' . $type . '_' . $id));
    return json_decode((string) $value, true);
}

function removal_key(int $radio, int $owner): string {
    return hash('sha256', $radio . ':' . $owner);
}

function request_removal(\WP_REST_Request $request): \WP_REST_Response|\WP_Error {
    $id = (int) $request->get_url_params()['id'];
    $account = wp_get_current_user();
    $private = str_contains($request->get_route(), '/me/');
    $row = $private ? owner_row($id) : row_by_id($id);
    if (is_wp_error($row)) return $row;
    if (!$row || $row['status'] !== 'approved') return err('Rádio indisponível.', 404);
    if ($account->exists() && !wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) return err('Sessão inválida.', 403);
    $owner = $account->exists() ? $account->ID : 0;
    $key = $owner ? removal_key($id, $owner) : str_replace('-', '', wp_generate_uuid4());
    $existing = $owner ? request_record('removal', $key) : null;
    if ($existing) return err('Esta conta já solicitou a remoção desta Rádio.', 409);
    if (!permit('removal_request', $owner ? 'user:' . $owner : ip(), 5, HOUR_IN_SECONDS)) return err('Aguarde antes de tentar novamente.', 429);
    $data = ['radio' => $id];
    $reason = request_text($request, 'reason', 200);
    if (is_wp_error($reason)) return $reason;
    $data['reason'] = $reason;
    if ($owner) {
        $data += ['requester' => $owner, 'name' => $account->display_name, 'email' => $account->user_email];
    } else {
        foreach (['name' => 100, 'email' => 254] as $field => $limit) {
            $value = request_text($request, $field, $limit);
            if (is_wp_error($value)) return $value;
            $data[$field] = $value;
        }
        if (!is_email($data['email'])) return err('Informe um e-mail válido.', 422, 'email');
    }
    $raw = $request['evidence'];
    $evidence = $owner && ($raw === null || (is_string($raw) && trim($raw) === '')) ? '' : request_text($request, 'evidence', 3000, true);
    if (is_wp_error($evidence)) return $evidence;
    $data['evidence'] = $evidence;
    if (!save_removal_request($id, $key, $data)) {
        if ($owner && request_record('removal', $key)) return err('Esta conta já solicitou a remoção desta Rádio.', 409);
        return err('Não foi possível registrar o pedido.', 503);
    }
    return new \WP_REST_Response(['message' => 'Pedido enviado para análise.', 'status' => 'pending'], 201);
}

function save_removal_request(int $id, string $key, array $data): bool {
    global $wpdb;
    $table = table();
    if (false === $wpdb->query('START TRANSACTION')) return false;
    $saved = false;
    try {
        $status = $wpdb->get_var($wpdb->prepare("SELECT status FROM $table WHERE id = %d FOR UPDATE", $id));
        $saved = $status === 'approved' && save_request('removal', $key, $data) && false !== $wpdb->query('COMMIT');
        return $saved;
    } finally {
        if (!$saved) $wpdb->query('ROLLBACK');
    }
}

function pending_requests(string $type, int $limit, int $offset = 0): array {
    global $wpdb;
    $prefix = $wpdb->esc_like('a7r_queue_' . $type . '_') . '%';
    return $wpdb->get_results($wpdb->prepare(
        "SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE %s AND JSON_UNQUOTE(JSON_EXTRACT(option_value, '$.status')) = 'pending' ORDER BY option_id LIMIT %d OFFSET %d",
        $prefix, $limit, $offset
    ), ARRAY_A) ?: [];
}

function requests_page(): void {
    require_moderator();
    $type = ($_GET['kind'] ?? '') === 'removal' ? 'removal' : 'category';
    $page = max(1, min(100000, absint($_GET['paged'] ?? 1)));
    $url = admin_url('admin.php?page=a7r-requests&kind=' . $type);
    $rows = pending_requests($type, 21, ($page - 1) * 20);
    ?>
    <div class="wrap a7r-admin"><h1>Solicitações</h1>
    <p><a class="button" href="<?= esc_url(admin_url('admin.php?page=a7r-requests&kind=category')) ?>">Sugestões de categorias</a>
    <a class="button" href="<?= esc_url(admin_url('admin.php?page=a7r-requests&kind=removal')) ?>">Pedidos de remoção</a></p>
    <?php if (!$rows): ?><p>Nenhuma solicitação neste filtro.</p><?php endif; ?>
    <?php foreach (array_slice($rows, 0, 20) as $row): $data = json_decode($row['option_value'], true); ?>
        <form action="<?= esc_url(admin_url('admin-post.php')) ?>" method="post">
            <?php wp_nonce_field($row['option_name']); ?>
            <input type="hidden" name="action" value="a7r_request_decision">
            <input type="hidden" name="record" value="<?= esc_attr($row['option_name']) ?>">
            <h2><?= esc_html($data['name']) ?></h2><p><?= esc_html($data['submitted']) ?></p>
            <?php if ($type === 'removal'): ?>
                <p><?= esc_html($data['email']) ?> · <a href="<?= esc_url(admin_url('admin.php?page=a7r&radio=' . $data['radio'])) ?>">Ver Rádio</a></p>
                <p><strong><?= esc_html($data['reason']) ?></strong></p><p><?= nl2br(esc_html($data['evidence'])) ?></p>
            <?php endif; ?>
            <p><label>Justificativa <textarea name="reason" maxlength="1000" required></textarea></label></p>
            <?php if ($type === 'removal'): ?><p><label><input type="checkbox" name="confirmArchive" value="1"> Confirmo o arquivamento se o pedido for aprovado</label></p><?php endif; ?>
            <button class="button button-primary" name="decision" value="approve"><?= $type === 'removal' ? 'Aprovar e arquivar Rádio' : 'Aprovar categoria' ?></button>
            <button class="button" name="decision" value="reject">Rejeitar</button>
        </form>
    <?php endforeach; ?>
    <?php if ($page > 1): ?><a class="button" href="<?= esc_url(add_query_arg('paged', $page - 1, $url)) ?>">Anterior</a><?php endif; ?>
    <?php if (count($rows) > 20): ?><a class="button" href="<?= esc_url(add_query_arg('paged', $page + 1, $url)) ?>">Próxima</a><?php endif; ?>
    </div>
    <?php
}

add_action('admin_post_a7r_request_decision', static function () {
    global $wpdb;
    require_moderator();
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') wp_die('Método inválido.', '', ['response' => 405]);
    $key = form_value('record');
    if (!preg_match('/^a7r_queue_(category|removal)_[a-f0-9]{32,64}$/D', $key, $match)) wp_die('Solicitação inválida.', '', ['response' => 400]);
    check_admin_referer($key);
    $decision = form_value('decision');
    $reason = sanitize_textarea_field(form_value('reason'));
    if (!in_array($decision, ['approve', 'reject'], true) || !$reason || strlen($reason) > 4000) wp_die('Informe a decisão e a justificativa.', '', ['response' => 422]);
    $lock = hash('sha256', $wpdb->options . ':' . $key);
    if ((int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 4)', $lock)) !== 1) wp_die('A solicitação está em análise.', '', ['response' => 409]);
    register_shutdown_function(static fn() => $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock)));
    $stored = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $key));
    $data = json_decode((string) $stored, true);
    if (!is_array($data) || $data['status'] !== 'pending') wp_die('Solicitação já analisada ou indisponível.', '', ['response' => 409]);
    if ($decision === 'approve' && $match[1] === 'category' && !term_exists($data['slug'], 'a7_radio_category')) {
        $result = wp_insert_term($data['name'], 'a7_radio_category', ['slug' => $data['slug']]);
        if (is_wp_error($result) && $result->get_error_code() !== 'term_exists') wp_die('Não foi possível criar a categoria.', '', ['response' => 409]);
    }
    if ($decision === 'approve' && $match[1] === 'removal') {
        if (form_value('confirmArchive') !== '1') wp_die('Confirme o arquivamento da rádio.', '', ['response' => 422, 'back_link' => true]);
        $radio = row_by_id((int) $data['radio']);
        if ($radio && $radio['status'] !== 'archived') {
            $result = moderate($radio, (int) $radio['sequence'], 'archive', $reason, get_current_user_id());
            if (is_wp_error($result)) wp_die(esc_html($result->get_error_message()), '', ['response' => 409]);
        }
    }
    $data['status'] = $decision === 'approve' ? 'approved' : 'rejected';
    if ($match[1] === 'removal') unset($data['name'], $data['email'], $data['reason'], $data['evidence']);
    $data += ['decidedAt' => gmdate(DATE_ATOM), 'decidedBy' => get_current_user_id(), 'decisionReason' => $reason];
    if (1 !== $wpdb->update($wpdb->options, ['option_value' => wp_json_encode($data)], ['option_name' => $key])) {
        wp_die('A decisão não pôde ser registrada. Reabra a fila para concluir.', '', ['response' => 503]);
    }
    wp_safe_redirect(admin_url('admin.php?page=a7r-requests&kind=' . $match[1]), 303);
    exit;
});

function pending_request_count(string $type): int {
    global $wpdb;
    $prefix = $wpdb->esc_like('a7r_queue_' . $type . '_') . '%';
    return (int) $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE %s AND JSON_UNQUOTE(JSON_EXTRACT(option_value, '$.status')) = 'pending'",
        $prefix
    ));
}
