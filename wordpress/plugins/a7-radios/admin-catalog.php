<?php
namespace A7Radios;
defined('ABSPATH') || exit;

add_action('admin_post_a7r_bulk', __NAMESPACE__ . '\bulk_action');
add_action('admin_post_a7r_manual_edit', __NAMESPACE__ . '\manual_edit_action');

function admin_metrics(array $metrics): void {
    echo '<div class="a7r-metrics">';
    foreach ($metrics as [$label, $count, $query, $tone]) {
        printf('<a class="a7r-metric a7r-metric-%s" href="%s"><strong>%s</strong><span>%s</span></a>',
            esc_attr($tone), esc_url(admin_url('admin.php?page=' . $query)), esc_html((int) $count), esc_html($label));
    }
    echo '</div>';
}

function moderation_page(): void {
    global $wpdb;
    require_moderator();
    $table = table();
    $counts = $wpdb->get_results("SELECT status, COUNT(*) AS total FROM $table GROUP BY status", OBJECT_K) ?: [];
    $total = array_sum(array_map(static fn($row) => (int) $row->total, $counts));
    $filters = [
        'queue' => 'Fila de aprovação', 'revisions' => 'Revisões pendentes', 'all' => 'Todas',
        'approved' => 'Aprovadas', 'pending' => 'Pendentes', 'rejected' => 'Rejeitadas', 'archived' => 'Arquivadas',
    ];
    $filter = isset($_GET['status']) && is_string($_GET['status']) ? sanitize_key($_GET['status']) : 'queue';
    if (!isset($filters[$filter])) $filter = 'queue';
    $search = isset($_GET['s']) && is_string($_GET['s']) ? sanitize_text_field(substr(wp_unslash($_GET['s']), 0, 250)) : '';
    $id = isset($_GET['radio']) && is_scalar($_GET['radio']) ? absint($_GET['radio']) : 0;
    $notice = get_transient('a7r_bulk_' . get_current_user_id());
    if ($notice) delete_transient('a7r_bulk_' . get_current_user_id());
    ?>
    <div class="wrap a7r-admin"><h1>A7 Rádios</h1>
    <?php if ($notice): ?><div class="notice notice-info"><p><strong>Resultado da moderação em lote</strong></p><ul>
        <?php foreach ($notice as $line): ?><li><?= esc_html($line) ?></li><?php endforeach; ?>
    </ul></div><?php endif; ?>
    <?php admin_metrics([
        ['Cadastradas', $total, 'a7r&status=all', 'total'],
        ['Aprovadas', $counts['approved']->total ?? 0, 'a7r&status=approved', 'approved'],
        ['Pendentes', $counts['pending']->total ?? 0, 'a7r&status=pending', 'pending'],
        ['Rejeitadas', $counts['rejected']->total ?? 0, 'a7r&status=rejected', 'rejected'],
        ['Arquivadas', $counts['archived']->total ?? 0, 'a7r&status=archived', 'archived'],
    ]); ?>
    <?php if ($id):
        $row = row_by_id($id);
        if (!$row) echo '<p>Rádio indisponível.</p>';
        elseif (($_GET['view'] ?? '') === 'edit' && $row['status'] !== 'archived') manual_edit_panel($row);
        else review_panel($row);
    else:
        $where = match ($filter) {
            'queue' => 'pending = 1', 'revisions' => "pending = 1 AND status <> 'pending'",
            'approved','pending','rejected','archived' => $wpdb->prepare('status = %s', $filter),
            default => '1 = 1'
        };
        if ($search !== '') {
            $pattern = '%' . $wpdb->esc_like($search) . '%';
            $where .= $wpdb->prepare(" AND (published_name LIKE %s OR slug LIKE %s OR JSON_UNQUOTE(JSON_EXTRACT(state, '$.revision.fields.name')) LIKE %s OR id = %d)",
                $pattern, $pattern, $pattern, ctype_digit($search) ? (int) $search : 0);
        }
        $page = max(1, min(100000, absint($_GET['paged'] ?? 1)));
        $total_pages = (int) ceil(((int) $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE $where")) / 30);
        $sort = in_array($filter, ['queue', 'revisions'], true) ? 'submitted_at ASC, id ASC' : 'submitted_at DESC, id DESC';
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $table WHERE $where ORDER BY $sort LIMIT 30 OFFSET %d", ($page - 1) * 30), ARRAY_A);
        ?>
        <form class="a7r-filters" action="<?= esc_url(admin_url('admin.php')) ?>" method="get">
            <input type="hidden" name="page" value="a7r">
            <label>Buscar por nome, slug ou ID <input type="search" name="s" value="<?= esc_attr($search) ?>" maxlength="100"></label>
            <label>Status <select name="status">
                <?php foreach ($filters as $key => $label): ?><option value="<?= esc_attr($key) ?>" <?php selected($filter, $key); ?>><?= esc_html($label) ?></option><?php endforeach; ?>
            </select></label>
            <button class="button button-primary">Filtrar</button>
            <a href="<?= esc_url(admin_url('admin.php?page=a7r')) ?>">Limpar</a>
        </form>
        <form class="a7r-bulk" method="post" action="<?= esc_url(admin_url('admin-post.php')) ?>">
            <?php wp_nonce_field('a7r_bulk'); ?>
            <input type="hidden" name="action" value="a7r_bulk">
            <input type="hidden" name="filter" value="<?= esc_attr($filter) ?>">
            <input type="hidden" name="search" value="<?= esc_attr($search) ?>">
            <div class="a7r-bulk-tools">
                <label>Ação em lote <select name="decision" required><option value="">Selecione</option>
                    <option value="approve">Aprovar</option><option value="reject">Rejeitar</option><option value="archive">Arquivar</option></select></label>
                <label>Motivo para rejeitar ou arquivar <input name="reason" maxlength="500"></label>
                <label><input type="checkbox" name="confirmArchive" value="1"> Confirmo o arquivamento</label>
                <button class="button button-primary" <?= !$rows ? 'disabled' : '' ?>>Aplicar</button>
            </div>
            <div class="a7r-table-scroll"><table class="widefat striped"><thead><tr>
                <th scope="col"><input type="checkbox" data-a7r-select-all aria-label="Selecionar todas as rádios da página"></th>
                <th scope="col">Rádio</th><th scope="col">Proprietário</th><th scope="col">Publicação</th><th scope="col">Revisão</th><th scope="col">Envio (UTC)</th><th scope="col">Ações</th>
            </tr></thead><tbody>
            <?php foreach ($rows as $row):
                $revision = state($row)['revision'];
                $owner = get_userdata((int) $row['owner']);
                $url = admin_url('admin.php?page=a7r&radio=' . $row['id']); ?>
                <tr>
                    <td><input type="checkbox" data-a7r-row name="selected[]" value="<?= esc_attr($row['id'] . ':' . $row['sequence']) ?>" aria-label="<?= esc_attr('Selecionar ' . $revision['fields']['name']) ?>" <?= $row['status'] === 'archived' ? 'disabled' : '' ?>></td>
                    <td><div class="a7r-radio-cell"><?php review_value($row, 'asset', $revision['fields']['asset'], true); ?>
                        <div><a class="a7r-radio-title" href="<?= esc_url($url) ?>"><?= esc_html($revision['fields']['name']) ?></a>
                        <?php if (isset($revision['categorySuggestion'])): ?><small>Sugestão: <?= esc_html($revision['categorySuggestion']['name']) ?></small><?php endif; ?></div></div></td>
                    <td><?= esc_html($owner ? $owner->display_name : 'Conta indisponível') ?></td>
                    <td><span class="a7r-badge a7r-<?= esc_attr($row['status']) ?>"><?= esc_html(status_name($row['status'])) ?></span></td>
                    <td><span class="a7r-badge a7r-<?= esc_attr($revision['status']) ?>"><?= esc_html(status_name($revision['status'])) ?></span></td>
                    <td><?= esc_html($row['submitted_at']) ?></td>
                    <td class="a7r-row-actions"><a class="button <?= $row['pending'] ? 'button-primary' : '' ?>" href="<?= esc_url($url) ?>"><?= $row['pending'] ? 'Analisar' : 'Ver detalhes' ?></a>
                    <?php if ($row['status'] !== 'archived'): ?><a class="button" href="<?= esc_url(add_query_arg('view', 'edit', $url)) ?>">Editar</a><?php endif; ?>
                    <?php if ($row['status'] === 'approved'): ?><a class="button" href="<?= esc_url(radio_url($row['slug'])) ?>" target="_blank" rel="noopener noreferrer">Ver Rádio</a><?php endif; ?></td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$rows): ?><tr><td colspan="7">Nenhuma rádio neste filtro.</td></tr><?php endif; ?>
            </tbody></table></div>
        </form>
        <p><?= wp_kses_post(paginate_links(['total' => max(1, $total_pages), 'current' => $page])) ?></p>
    <?php endif; ?></div>
    <?php
}

function bulk_action(): void {
    require_moderator();
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') wp_die('Método inválido.', '', ['response' => 405]);
    check_admin_referer('a7r_bulk');
    $selected = $_POST['selected'] ?? [];
    $decision = form_value('decision');
    $reason = sanitize_textarea_field(form_value('reason'));
    if (!is_array($selected) || !$selected || count($selected) > 30 ||
        !in_array($decision, ['approve', 'reject', 'archive'], true) || strlen($reason) > 2000 ||
        ($decision !== 'approve' && $reason === '') || ($decision === 'archive' && form_value('confirmArchive') !== '1')) {
        wp_die('Selecione as rádios e a ação. Informe o motivo para rejeitar ou arquivar e confirme o arquivamento.', '', ['response' => 422, 'back_link' => true]);
    }
    $results = [];
    foreach ($selected as $pair) {
        if (!is_string($pair) || !preg_match('/^([1-9][0-9]{0,18}):([0-9]{1,18})$/D', $pair, $match)) {
            $results[] = 'Seleção inválida.';
            continue;
        }
        $row = row_by_id((int) $match[1]);
        $result = $row ? moderate($row, (int) $match[2], $decision, $reason, get_current_user_id()) : err('Rádio indisponível.', 404);
        $results[] = 'Rádio #' . $match[1] . ' · ' . (is_wp_error($result) ? $result->get_error_message() : 'Decisão registrada.');
    }
    set_transient('a7r_bulk_' . get_current_user_id(), $results, 60);
    wp_safe_redirect(add_query_arg(['page' => 'a7r', 'status' => sanitize_key(form_value('filter')), 's' => sanitize_text_field(form_value('search'))], admin_url('admin.php')), 303);
    exit;
}

function manual_edit_panel(array $row): void {
    $data = state($row);
    $fields = $data['published'] ?? $data['revision']['fields'];
    ?>
    <h2>Edição administrativa · <?= esc_html($fields['name']) ?></h2>
    <p><?= $row['version'] ? 'As correções formarão uma nova versão pública.' : 'A proposta corrigida ficará disponível na fila de aprovação.' ?></p>
    <form method="post" enctype="multipart/form-data" action="<?= esc_url(admin_url('admin-post.php')) ?>">
        <?php wp_nonce_field('a7r_manual_' . $row['id']); ?>
        <input type="hidden" name="action" value="a7r_manual_edit">
        <input type="hidden" name="id" value="<?= esc_attr($row['id']) ?>">
        <input type="hidden" name="sequence" value="<?= esc_attr($row['sequence']) ?>">
        <div class="a7r-edit-fields">
            <label>Nome da rádio <input name="name" value="<?= esc_attr($fields['name']) ?>" maxlength="100" required></label>
            <label>Categoria <select name="categoryId" required><option value="">Selecione</option>
                <?php foreach (category_options() as $category): ?><option value="<?= esc_attr($category['id']) ?>" <?php selected($fields['categoryId'], $category['id']); ?>><?= esc_html($category['name']) ?></option><?php endforeach; ?>
            </select></label>
            <?php foreach (['country' => 'País', 'region' => 'Estado/região', 'city' => 'Cidade', 'streamUrl' => 'Streaming HTTPS', 'websiteUrl' => 'Site oficial', 'appDownloadUrl' => 'URL do App'] as $key => $label):
                $is_url = str_ends_with($key, 'Url'); ?>
                <label><?= esc_html($label) ?><input type="<?= $is_url ? 'url' : 'text' ?>" name="<?= esc_attr($key) ?>" maxlength="<?= $is_url ? 2000 : ($key === 'city' ? 100 : 80) ?>" value="<?= esc_attr($fields[$key] ?? '') ?>" <?= in_array($key, ['country', 'streamUrl'], true) ? 'required' : '' ?>></label>
            <?php endforeach; ?>
            <label>Nova imagem (opcional) <input type="file" name="image" accept="image/png,image/jpeg,image/webp"></label>
        </div>
        <p><label>Descrição <textarea class="large-text" name="description" maxlength="2000" rows="4" required><?= esc_textarea($fields['description']) ?></textarea></label></p>
        <p><label>Justificativa <textarea class="large-text" name="reason" maxlength="500" rows="2" required></textarea></label></p>
        <?php if ($row['version'] && $row['pending']): ?>
            <p><label><input type="checkbox" name="confirmSupersede" value="1" required> Confirmo que a revisão pendente será encerrada para preservar as correções administrativas.</label></p>
        <?php endif; ?>
        <button class="button button-primary">Salvar correções</button>
        <a class="button" href="<?= esc_url(admin_url('admin.php?page=a7r&radio=' . $row['id'])) ?>">Cancelar</a>
    </form>
    <?php
}

function manual_edit_action(): void {
    require_moderator();
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') wp_die('Método inválido.', '', ['response' => 405]);
    $id = absint(form_value('id'));
    check_admin_referer('a7r_manual_' . $id);
    $row = row_by_id($id);
    if (!$row || $row['status'] === 'archived' || (int) $row['sequence'] !== (int) form_value('sequence')) {
        wp_die('A rádio mudou. Reabra a edição.', '', ['response' => 409, 'back_link' => true]);
    }
    $reason = sanitize_textarea_field(form_value('reason'));
    $published = (int) $row['version'] > 0;
    if ($reason === '' || strlen($reason) > 2000 || ($published && $row['pending'] && form_value('confirmSupersede') !== '1')) {
        wp_die('Informe a justificativa e confirme o encerramento da revisão pendente quando aplicável.', '', ['response' => 422]);
    }
    $data = state($row);
    $request = new \WP_REST_Request('POST');
    $request->set_body_params(wp_unslash($_POST));
    $request->set_file_params($_FILES);
    $fields = validate_fields($request);
    if (is_wp_error($fields)) wp_die(esc_html($fields->get_error_message()), '', ['response' => 422, 'back_link' => true]);
    $previous = ($data['published'] ?? $data['revision']['fields'])['asset'];
    $asset = save_image($request, $previous);
    if (is_wp_error($asset)) wp_die(esc_html($asset->get_error_message()), '', ['response' => 422, 'back_link' => true]);
    $fields['asset'] = $asset;
    $revision = $data['revision'];
    $now = gmdate(DATE_ATOM);
    $record = ['decidedAt' => $now, 'decidedBy' => get_current_user_id(), 'reason' => $reason, 'source' => 'admin'];
    if ($published && $row['pending']) {
        $data['revision'] = array_merge($revision, $record, ['status' => 'rejected', 'reason' => 'Revisão encerrada pela edição administrativa. ' . $reason]);
        $data['history'][] = $data['revision'];
    }
    $id_revision = (int) $row['sequence'] + 1;
    $data['history'][] = ['id' => $id_revision, 'status' => $published ? 'approved' : 'pending', 'previous' => $data['published'] ?? $revision['fields'], 'fields' => $fields] + $record;
    if ($published) {
        if (!$row['pending'] && $revision['status'] === 'approved') {
            $data['revision'] = array_merge($revision, ['id' => $id_revision, 'fields' => $fields], $record);
            unset($data['revision']['categorySuggestion']);
        }
        $data['published'] = $fields;
        $columns = publication_columns($row, $fields) + ['pending' => 0];
    } else {
        $data['revision'] = array_merge($revision, ['id' => $id_revision, 'fields' => $fields, 'status' => 'pending', 'submittedAt' => $now, 'reason' => '']);
        unset($data['revision']['categorySuggestion'], $data['revision']['decidedAt'], $data['revision']['decidedBy']);
        $columns = ['pending' => 1, 'status' => 'pending', 'submitted_at' => gmdate('Y-m-d H:i:s')];
    }
    if (!change_radio($row, $data, $columns)) {
        if ($asset !== $previous) remove_unreferenced_image($asset);
        wp_die('A rádio mudou. A edição não foi aplicada.', '', ['response' => 409, 'back_link' => true]);
    }
    wp_safe_redirect(admin_url('admin.php?page=a7r&radio=' . $id), 303);
    exit;
}

function publication_columns(array $row, array $fields): array {
    $now = gmdate('Y-m-d H:i:s');
    return [
        'status' => 'approved', 'version' => (int) $row['version'] + 1, 'approved_at' => $row['approved_at'] ?: $now, 'updated_at' => $now,
        'published_name' => $fields['name'], 'category' => $fields['categoryId'],
        'category_slug' => $fields['category']['slug'], 'category_name' => $fields['category']['name'],
    ];
}

function moderation_category(array $revision, array $choice): \WP_Term|\WP_Error {
    $suggestion = $revision['categorySuggestion'] ?? null;
    $tax = 'a7_radio_category';
    $id = (int) $revision['fields']['categoryId'];
    if (!$suggestion || (empty($choice['create']) && empty($choice['id']))) {
        $term = $id ? get_term($id, $tax) : null;
        if (!$term && $suggestion) {
            $record = request_record('category', $suggestion['id']);
            if (($record['status'] ?? '') === 'approved') $term = get_term_by('slug', $record['slug'], $tax);
        }
        return $term instanceof \WP_Term ? $term : err('Defina uma categoria válida na tela de revisão antes de aprovar.', 422);
    }

    global $wpdb;
    $key = 'a7r_queue_category_' . $suggestion['id'];
    $lock = hash('sha256', $wpdb->options . ':' . $key);
    if ((int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 4)', $lock)) !== 1) return err('A categoria está em análise. Tente novamente.', 409);
    try {
        $record = request_record('category', $suggestion['id']);
        if (!empty($choice['create'])) {
            if (!empty($choice['id'])) return err('Escolha criar uma categoria ou usar uma existente.', 422);
            if (($record['status'] ?? '') === 'approved') {
                $term = get_term_by('slug', $record['slug'], $tax);
            } elseif (($record['status'] ?? '') === 'pending') {
                $name = $choice['name'] ?: $suggestion['name'];
                $slug = sanitize_title($name);
                if (!$slug || strlen($name) > 320) return err('Informe um nome de categoria válido.', 422);
                $term = get_term_by('slug', $slug, $tax);
                if (!$term) {
                    $insert = wp_insert_term($name, $tax, ['slug' => $slug]);
                    if (is_wp_error($insert) && $insert->get_error_code() !== 'term_exists') return $insert;
                    $id = is_wp_error($insert) ? (int) $insert->get_error_data() : (int) $insert['term_id'];
                    $term = get_term($id, $tax);
                }
            } else {
                return err('A sugestão foi rejeitada. Vincule uma categoria existente.', 422);
            }
        } else {
            $term = get_term(absint($choice['id']), $tax);
        }
        if (!$term instanceof \WP_Term) return err('Categoria indisponível.', 422);
        if (($record['status'] ?? '') === 'pending') {
            $record = array_merge($record, ['status' => 'approved', 'slug' => $term->slug, 'decidedAt' => gmdate(DATE_ATOM),
                'decidedBy' => get_current_user_id(), 'decisionReason' => 'Categoria definida na revisão da rádio.']);
            if (1 !== $wpdb->update($wpdb->options, ['option_value' => wp_json_encode($record)], ['option_name' => $key])) {
                return err('Não foi possível registrar a resolução da categoria.', 503);
            }
        }
        return $term;
    } finally {
        $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock));
    }
}
