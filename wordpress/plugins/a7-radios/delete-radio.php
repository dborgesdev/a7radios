<?php
namespace A7Radios;
defined('ABSPATH') || exit;

add_action('admin_post_a7r_delete_radio', __NAMESPACE__ . '\delete_radio_action');

function can_delete_radio(): bool {
    return current_user_can('a7r_moderate') && current_user_can('manage_options');
}

function delete_radio(int $id, int $sequence): true|\WP_Error {
    global $wpdb;
    if (!can_delete_radio()) return err('Sem permissão para excluir rádios.', 403);
    $table = table();
    // The catalog and linked option records must roll back together.
    $options = $wpdb->get_row($wpdb->prepare('SHOW TABLE STATUS LIKE %s', $wpdb->esc_like($wpdb->options)));
    if (strcasecmp($options->Engine ?? '', 'InnoDB') !== 0) return err('A exclusão exige a tabela de opções em InnoDB.', 503);
    if (false === $wpdb->query('START TRANSACTION')) return err('Não foi possível iniciar a exclusão.', 503);
    $committed = false;
    try {
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE id = %d FOR UPDATE", $id), ARRAY_A);
        if (!$row || (int) $row['sequence'] !== $sequence) return err('A rádio mudou ou já foi excluída.', 409);
        $prefix = $wpdb->esc_like('a7r_queue_removal_') . '%';
        if (false === $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s
             AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(option_value), option_value, '{}'), '$.radio')) = %s",
            $prefix, (string) $id
        ))) return err('Não foi possível remover os pedidos vinculados.', 503);
        if (1 !== $wpdb->delete($table, ['id' => $id, 'sequence' => $sequence])) return err('A exclusão não foi concluída.', 409);
        $audit = ['radio' => $id, 'action' => 'delete', 'by' => get_current_user_id(), 'at' => gmdate(DATE_ATOM)];
        if (1 !== $wpdb->insert($wpdb->options, ['option_name' => 'a7r_audit_deleted_' . $id, 'option_value' => wp_json_encode($audit), 'autoload' => 'off'])) {
            return err('Não foi possível registrar a exclusão.', 503);
        }
        $committed = false !== $wpdb->query('COMMIT');
        if (!$committed) return err('A exclusão não foi confirmada.', 503);
    } finally {
        if (!$committed) $wpdb->query('ROLLBACK');
    }

    $assets = [];
    array_walk_recursive(state($row), static function ($value, $key) use (&$assets) {
        if ($key === 'asset' && is_string($value) && preg_match('/^[a-f0-9]{48}$/D', $value)) $assets[$value] = true;
    });
    foreach (array_keys($assets) as $asset) {
        $reference = $wpdb->get_var($wpdb->prepare("SELECT id FROM $table WHERE state LIKE %s LIMIT 1", '%' . $wpdb->esc_like($asset) . '%'));
        if ($reference === null && !$wpdb->last_error) remove_unreferenced_image($asset);
    }
    // These responses are revalidated. Cache integrations can purge their own copies.
    do_action('a7r_radio_deleted', $id, $row['slug']);
    return true;
}

function delete_radio_action(): void {
    require_moderator();
    if (!can_delete_radio()) wp_die('Acesso negado.', '', ['response' => 403]);
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') wp_die('Método inválido.', '', ['response' => 405]);
    $id = absint(form_value('id'));
    check_admin_referer('a7r_delete_' . $id);
    if (form_value('confirmDelete') !== '1') wp_die('Confirme a exclusão definitiva.', '', ['response' => 422, 'back_link' => true]);
    $result = delete_radio($id, (int) form_value('sequence'));
    if (is_wp_error($result)) wp_die(esc_html($result->get_error_message()), '', ['response' => $result->get_error_data()['status'], 'back_link' => true]);
    set_transient('a7r_bulk_' . get_current_user_id(), ['Rádio #' . $id . ' excluída definitivamente.'], 60);
    wp_safe_redirect(admin_url('admin.php?page=a7r&status=all'), 303);
    exit;
}

function deletion_panel(array $row): void {
    if (!can_delete_radio()) return;
    ?>
    <form class="a7r-danger" method="post" action="<?= esc_url(admin_url('admin-post.php')) ?>">
        <?php wp_nonce_field('a7r_delete_' . $row['id']); ?>
        <input type="hidden" name="action" value="a7r_delete_radio">
        <input type="hidden" name="id" value="<?= esc_attr($row['id']) ?>">
        <input type="hidden" name="sequence" value="<?= esc_attr($row['sequence']) ?>">
        <h2>Excluir rádio</h2>
        <p>Esta ação é permanente. A rádio, suas revisões e seus pedidos de remoção serão excluídos.</p>
        <p><label><input type="checkbox" name="confirmDelete" value="1" required> Confirmo a exclusão definitiva desta rádio.</label></p>
        <button type="submit" class="button a7r-danger-button">Excluir rádio</button>
    </form>
    <?php
}
