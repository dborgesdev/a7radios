<?php
namespace A7Radios;
defined('ABSPATH') || exit;

function register_admin(): void {
    add_menu_page('A7 Rádios', 'A7 Rádios', 'a7r_moderate', 'a7r', __NAMESPACE__ . '\moderation_page', 'dashicons-format-audio');
    add_submenu_page('a7r', 'Categorias', 'Categorias', 'a7r_moderate', 'edit-tags.php?taxonomy=a7_radio_category&post_type=a7_radio');
    add_submenu_page('a7r', 'Documentos aprovados', 'Documentos aprovados', 'a7r_moderate', 'a7r-legal', __NAMESPACE__ . '\legal_page');
    add_submenu_page('a7r', 'Solicitações', 'Solicitações', 'a7r_moderate', 'a7r-requests', __NAMESPACE__ . '\requests_page');
    if (current_user_can('list_users')) add_submenu_page('a7r', 'Usuários', 'Usuários', 'list_users', 'users.php');
}

add_action('admin_post_a7r_decide', __NAMESPACE__ . '\decide_action');
add_action('admin_post_a7r_legal', __NAMESPACE__ . '\legal_action');
add_action('admin_post_a7r_review_image', __NAMESPACE__ . '\review_image');

function require_moderator(): void {
    if (!current_user_can('a7r_moderate')) wp_die('Acesso negado.', '', ['response' => 403]);
    if (!headers_sent()) no_store();
}

function moderation_page(): void {
    global $wpdb;
    require_moderator();
    $table = table();
    $counts = $wpdb->get_results("SELECT status, COUNT(*) AS total FROM $table GROUP BY status", OBJECT_K);
    $users = count_users();
    $total = array_sum(array_map(static fn($row) => (int) $row->total, $counts));
    $filter = isset($_GET['status']) && is_string($_GET['status']) ? sanitize_key($_GET['status']) : 'queue';
    $id = isset($_GET['radio']) && is_scalar($_GET['radio']) ? absint($_GET['radio']) : 0;
    ?>
    <div class="wrap a7r-admin"><h1>A7 Rádios</h1>
    <p><strong>Cadastradas:</strong> <?= esc_html($total) ?> ·
    <strong>Aprovadas:</strong> <?= esc_html($counts['approved']->total ?? 0) ?> ·
    <strong>Pendentes:</strong> <?= esc_html($counts['pending']->total ?? 0) ?> ·
    <strong>Rejeitadas:</strong> <?= esc_html($counts['rejected']->total ?? 0) ?> ·
    <strong>Usuários:</strong> <?= esc_html($users['avail_roles']['a7r_owner'] ?? 0) ?></p>
    <p>
    <?php foreach (['queue' => 'Fila de revisão', 'all' => 'Todas', 'approved' => 'Aprovadas', 'pending' => 'Pendentes', 'rejected' => 'Rejeitadas', 'archived' => 'Arquivadas'] as $key => $label): ?>
        <a class="button <?= $filter === $key ? 'button-primary' : '' ?>" href="<?= esc_url(admin_url('admin.php?page=a7r&status=' . $key)) ?>"><?= esc_html($label) ?></a>
    <?php endforeach; ?>
    </p>
    <?php if ($id): ?>
        <?php $row = row_by_id($id); if ($row) review_panel($row); else echo '<p>Rádio indisponível.</p>'; ?>
    <?php else:
        $where = match ($filter) {
            'queue' => 'WHERE pending = 1', 'approved','pending','rejected','archived' => $wpdb->prepare('WHERE status = %s', $filter),
            default => ''
        };
        $page = max(1, min(100000, absint($_GET['paged'] ?? 1)));
        $total_pages = (int) ceil(((int) $wpdb->get_var("SELECT COUNT(*) FROM $table $where")) / 30);
        $sort = $filter === 'queue' ? 'submitted_at ASC, id ASC' : 'submitted_at DESC, id DESC';
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $table $where ORDER BY $sort LIMIT 30 OFFSET %d", ($page - 1) * 30), ARRAY_A);
        ?>
        <table class="widefat striped"><thead><tr><th>Rádio</th><th>Proprietário</th><th>Publicação</th><th>Revisão</th><th>Envio (UTC)</th><th>Ações</th></tr></thead><tbody>
        <?php foreach ($rows as $row):
            $revision = state($row)['revision'];
            $owner = get_userdata((int) $row['owner']); ?>
            <tr><td><a href="<?= esc_url(admin_url('admin.php?page=a7r&radio=' . $row['id'])) ?>"><?= esc_html($revision['fields']['name']) ?></a></td>
            <td><?= esc_html($owner ? $owner->display_name : 'Conta indisponível') ?></td>
            <td><span class="a7r-badge a7r-<?= esc_attr($row['status']) ?>"><?= esc_html(status_name($row['status'])) ?></span></td>
            <td><span class="a7r-badge a7r-<?= esc_attr($revision['status']) ?>"><?= esc_html(status_name($revision['status'])) ?></span></td>
            <td><?= esc_html($row['submitted_at']) ?></td>
            <td><a class="button <?= $row['pending'] ? 'button-primary' : '' ?>" href="<?= esc_url(admin_url('admin.php?page=a7r&radio=' . $row['id'])) ?>"><?= $row['pending'] ? 'Analisar' : 'Ver detalhes' ?></a>
            <?php if ($row['status'] === 'approved'): ?><a class="button" href="<?= esc_url(radio_url($row['slug'])) ?>" target="_blank" rel="noopener noreferrer">Ver Rádio</a><?php endif; ?></td></tr>
        <?php endforeach; ?>
        <?php if (!$rows): ?><tr><td colspan="6">Nenhuma rádio neste filtro.</td></tr><?php endif; ?>
        </tbody></table>
        <p><?= wp_kses_post(paginate_links(['total' => max(1, $total_pages), 'current' => $page])) ?></p>
    <?php endif; ?></div>
    <?php
}

function status_name(string $status): string {
    return ['pending' => 'Pendente', 'approved' => 'Aprovada', 'rejected' => 'Rejeitada', 'archived' => 'Arquivada'][$status] ?? $status;
}

function review_panel(array $row): void {
    $data = state($row);
    $revision = $data['revision'];
    $before = $data['published'];
    $after = $revision['fields'];
    $labels = [
        'name' => 'Nome', 'category' => 'Categoria', 'country' => 'País', 'region' => 'Estado/região', 'city' => 'Cidade',
        'description' => 'Descrição', 'streamUrl' => 'Streaming', 'websiteUrl' => 'Site',
        'appDownloadUrl' => 'Aplicativo', 'asset' => 'Imagem',
    ];
    ?>
    <h2><?= esc_html($after['name']) ?></h2>
    <p><?= esc_html(status_name($row['status'])) ?> · Proposta <?= esc_html(status_name($revision['status'])) ?> · Versão publicada <?= esc_html($row['version']) ?></p>
    <?php if ($row['status'] === 'approved'): ?><p><a href="<?= esc_url(radio_url($row['slug'])) ?>">Abrir página publicada</a></p><?php endif; ?>
    <table class="widefat striped"><thead><tr><th>Campo</th><th>Publicado</th><th>Proposta</th></tr></thead><tbody>
    <?php foreach ($labels as $field => $label): ?>
        <tr><th scope="row"><?= esc_html($label) ?><?= ($before[$field] ?? null) !== ($after[$field] ?? null) ? '<br><em>Alterado</em>' : '' ?></th>
        <td><?php review_value($row, $field, $before[$field] ?? null); ?></td><td><?php review_value($row, $field, $after[$field] ?? null); ?></td></tr>
    <?php endforeach; ?>
    </tbody></table>
    <p>Aceite: versão <?= esc_html($revision['acceptance']['version']) ?>, <?= esc_html($revision['acceptance']['at']) ?>.</p>
    <?php if ($row['pending'] || $row['status'] !== 'archived'): ?>
        <form method="post" action="<?= esc_url(admin_url('admin-post.php')) ?>">
            <input type="hidden" name="action" value="a7r_decide">
            <input type="hidden" name="id" value="<?= esc_attr($row['id']) ?>">
            <input type="hidden" name="sequence" value="<?= esc_attr($row['sequence']) ?>">
            <?php wp_nonce_field('a7r_decide_' . $row['id']); ?>
            <p><label for="a7r-reason">Motivo (obrigatório para rejeitar ou arquivar)</label><br>
            <textarea id="a7r-reason" name="reason" rows="3" maxlength="500" class="large-text"></textarea></p>
            <?php if ($row['pending']): ?>
                <button class="button button-primary" name="decision" value="approve">Aprovar</button>
                <button class="button" name="decision" value="reject">Rejeitar</button>
            <?php endif; ?>
            <?php if ($row['status'] !== 'archived'): ?>
                <button class="button" name="decision" value="archive">Arquivar</button>
            <?php endif; ?>
        </form>
    <?php endif; ?>
    <h3>Histórico de decisões</h3><ul>
    <?php foreach ($data['history'] as $item): ?><li>
        <?= esc_html(status_name($item['status']) . ' · ' . $item['decidedAt'] . ' · moderador #' . $item['decidedBy'] . ' · ' . $item['reason']) ?>
    </li><?php endforeach; ?>
    </ul>
    <?php
}

function review_value(array $row, string $field, mixed $value): void {
    if ($field === 'asset' && $value) {
        $link = add_query_arg(['action' => 'a7r_review_image', 'id' => $row['id'], 'asset' => $value], admin_url('admin-post.php'));
        $link = wp_nonce_url($link, 'a7r_review_image_' . $row['id']);
        echo '<img src="' . esc_url($link) . '" width="96" height="96" alt="Imagem para revisão">';
    } else {
        echo nl2br(esc_html($field === 'category' ? ($value['name'] ?? '—') : ($value ?: '—')));
    }
}

function review_image(): void {
    require_moderator();
    $id = isset($_GET['id']) && is_scalar($_GET['id']) ? absint($_GET['id']) : 0;
    check_admin_referer('a7r_review_image_' . $id);
    $row = row_by_id($id);
    $asset = $_GET['asset'] ?? '';
    if (!$row || !is_string($asset) || !preg_match('/^[a-f0-9]{48}$/D', $asset)) wp_die('Imagem indisponível.', '', ['response' => 404]);
    $data = state($row);
    if ($asset !== ($data['published']['asset'] ?? '') && $asset !== $data['revision']['fields']['asset']) {
        wp_die('Imagem indisponível.', '', ['response' => 404]);
    }
    image_output($asset, false);
    wp_die('Imagem indisponível.', '', ['response' => 404]);
}

function decide_action(): void {
    require_moderator();
    $id = absint(form_value('id'));
    check_admin_referer('a7r_decide_' . $id);
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') wp_die('Método inválido.', '', ['response' => 405]);
    $decision = form_value('decision');
    $reason = sanitize_textarea_field(form_value('reason'));
    $row = row_by_id($id);
    if (!$row || !in_array($decision, ['approve', 'reject', 'archive'], true) ||
        strlen($reason) > 2000 || ($decision !== 'approve' && $reason === '')) {
        wp_die('Decisão inválida. Informe um motivo para rejeitar ou arquivar.', '', ['response' => 422, 'back_link' => true]);
    }
    $result = moderate($row, (int) form_value('sequence'), $decision, $reason, get_current_user_id());
    if (is_wp_error($result)) wp_die(esc_html($result->get_error_message()), '', ['response' => 409, 'back_link' => true]);
    wp_safe_redirect(admin_url('admin.php?page=a7r&radio=' . $id), 303);
    exit;
}

function moderate(array $row, int $sequence, string $decision, string $reason, int $moderator): true|\WP_Error {
    $data = state($row);
    $revision = $data['revision'];
    $base = (int) $row['version'];
    if ($sequence !== (int) $row['sequence'] || $row['status'] === 'archived' ||
        ($decision !== 'archive' && (!$row['pending'] || $revision['base'] !== $base))) {
        return err('A versão mudou. Reabra a fila antes de decidir.', 409);
    }
    $record = ['decidedAt' => gmdate(DATE_ATOM), 'decidedBy' => $moderator, 'reason' => $reason];
    $columns = ['pending' => 0];
    if ($decision === 'approve') {
        $fields = $revision['fields'];
        $now = gmdate('Y-m-d H:i:s');
        $columns += [
            'status' => 'approved', 'version' => $base + 1, 'approved_at' => $row['approved_at'] ?: $now, 'updated_at' => $now,
            'published_name' => $fields['name'], 'category' => $fields['categoryId'],
            'category_slug' => $fields['category']['slug'], 'category_name' => $fields['category']['name'],
        ];
        $data['published'] = $fields;
        $revision['status'] = 'approved';
    } elseif ($decision === 'reject') {
        $columns['status'] = $base ? 'approved' : 'rejected';
        $revision['status'] = 'rejected';
    } else {
        $columns['status'] = 'archived';
        if ($row['pending']) $revision['status'] = 'rejected';
    }
    if ($row['pending']) {
        $data['revision'] = $revision + $record;
        $data['history'][] = $data['revision'];
    }
    if ($decision === 'archive') $data['history'][] = ['id' => $sequence + 1, 'status' => 'archived'] + $record;
    if (!change_radio($row, $data, $columns)) return err('A versão mudou ou não pôde ser gravada. Reabra a fila.', 409);
    return true;
}

function legal_page(): void {
    require_moderator();
    ?>
    <div class="wrap a7r-admin"><h1>Documentos aprovados</h1>
    <p>Publique aqui somente textos validados. Cada versão tem conteúdo fixo. Enquanto o termo estiver ausente, o envio de rádios permanece indisponível.</p>
    <?php foreach (['terms' => 'Termo de Responsabilidade', 'privacy' => 'Política de Privacidade'] as $key => $label): ?>
        <form action="<?= esc_url(admin_url('admin-post.php')) ?>" method="post">
            <h2><?= esc_html($label) ?></h2>
            <?php $current = legal($key); ?>
            <p>Versão atual: <?= esc_html($current['version'] ?? 'nenhuma') ?></p>
            <?php wp_nonce_field('a7r_legal_' . $key); ?>
            <input type="hidden" name="action" value="a7r_legal"><input type="hidden" name="document" value="<?= esc_attr($key) ?>">
            <input type="hidden" name="base" value="<?= esc_attr($current['version'] ?? '') ?>">
            <div class="a7r-editor" data-preview="<?= esc_attr(wp_create_nonce('a7r_document_preview')) ?>">
                <div class="a7r-tools">
                    <button type="button" class="button" data-prefix="## ">Título</button>
                    <button type="button" class="button" data-prefix="**" data-suffix="**">Negrito</button>
                    <button type="button" class="button" data-prefix="*" data-suffix="*">Itálico</button>
                    <button type="button" class="button" data-prefix="- ">Lista</button>
                    <button type="button" class="button" data-preview-button>Visualizar</button>
                </div>
                <p><label>Texto aprovado (Markdown)<textarea class="large-text" name="content" required maxlength="30000" rows="12"><?= esc_textarea($current['content'] ?? '') ?></textarea></label></p>
                <div class="a7r-document-preview" tabindex="0" hidden></div>
            </div>
            <p><label><input type="checkbox" name="approved" value="1" required> Confirmo que esta versão foi validada para publicação.</label></p>
            <p><button class="button button-primary">Ativar versão</button></p>
        </form>
        <?php document_history($key, $current['version'] ?? ''); ?>
    <?php endforeach; ?></div>
    <?php
}

function legal_action(): void {
    global $wpdb;
    require_moderator();
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') wp_die('Método inválido.', '', ['response' => 405]);
    $key = form_value('document');
    if (!in_array($key, ['terms', 'privacy'], true)) wp_die('Documento inválido.', '', ['response' => 400]);
    check_admin_referer('a7r_legal_' . $key);
    $lock = substr(hash('sha256', $wpdb->options . ':a7r:' . $key), 0, 64);
    if ((int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 4)', $lock)) !== 1) wp_die('Outro documento está sendo publicado. Tente novamente.', '', ['response' => 409]);
    register_shutdown_function(static fn() => $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock)));
    wp_cache_delete('a7r_' . $key, 'options');
    wp_cache_delete('notoptions', 'options');
    $current = legal($key);
    if (form_value('base') !== ($current['version'] ?? '')) wp_die('A versão vigente mudou. Reabra o editor.', '', ['response' => 409]);
    $version = gmdate('Ymd-His') . '-' . substr(wp_generate_uuid4(), 0, 8);
    $content = sanitize_textarea_field(str_replace(["\r\n", "\r"], "\n", form_value('content')));
    if (!preg_match('/^[a-zA-Z0-9_.-]{1,32}$/D', $version) || !$content || strlen($content) > 120000 || form_value('approved') !== '1') {
        wp_die('Versão ou texto inválido.', '', ['response' => 422]);
    }
    $entry = ['version' => $version, 'content' => $content, 'format' => 'markdown'];
    $archive = 'a7r_legal_' . $key . '_' . hash('sha256', strtolower($version));
    $record = $entry + ['by' => get_current_user_id(), 'at' => gmdate(DATE_ATOM)];
    // Reserve the immutable version atomically. WP add_option uses an upsert.
    $inserted = $wpdb->query($wpdb->prepare(
        "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'off')",
        $archive, maybe_serialize($record)
    ));
    if ($inserted === false) wp_die('Não foi possível guardar a versão.', '', ['response' => 503]);
    if ($inserted !== 1) {
        wp_die('Esta versão já existe. Escolha outra versão.', '', ['response' => 409]);
    }
    wp_cache_delete('notoptions', 'options');
    if (!update_option('a7r_' . $key, $entry, false) && legal($key) !== $entry) {
        wp_die('A versão foi guardada, mas a ativação falhou. Confira o banco antes de publicar com um novo número de versão.', '', ['response' => 503]);
    }
    wp_safe_redirect(admin_url('admin.php?page=a7r-legal'), 303);
    exit;
}
add_action('current_screen', static function ($screen) {
    if (current_user_can('a7r_moderate') && in_array($screen->id, ['toplevel_page_a7r', 'a7-radios_page_a7r-legal', 'a7-radios_page_a7r-requests'], true)) no_store();
});
add_action('admin_enqueue_scripts', static function () {
    $page = isset($_GET['page']) && is_string($_GET['page']) ? sanitize_key($_GET['page']) : '';
    if (!current_user_can('a7r_moderate') || !in_array($page, ['a7r', 'a7r-legal', 'a7r-requests'], true)) return;
    wp_enqueue_style('a7r-admin', plugins_url('admin.css', __FILE__), [], '2.0.0');
    if ($page === 'a7r-legal') wp_enqueue_script('a7r-admin', plugins_url('admin.js', __FILE__), [], '2.0.0', true);
});

add_action('wp_dashboard_setup', static function () {
    if (current_user_can('a7r_moderate')) wp_add_dashboard_widget('a7r_overview', 'A7 Rádios On-Line', __NAMESPACE__ . '\a7r_overview');
});

function a7r_overview(): void {
    global $wpdb;
    if (!current_user_can('a7r_moderate')) return;
    $table = table();
    $counts = $wpdb->get_row("SELECT COUNT(*) AS total, SUM(status = 'pending') AS pending,
        SUM(pending = 1 AND status <> 'pending') AS revisions FROM $table", ARRAY_A);
    $links = [
        ['Cadastradas', $counts['total'] ?? 0, 'a7r&status=all'],
        ['Pendentes de aprovação', $counts['pending'] ?? 0, 'a7r&status=pending'],
        ['Revisões pendentes', $counts['revisions'] ?? 0, 'a7r&status=queue'],
        ['Sugestões de categorias', pending_request_count('category'), 'a7r-requests&kind=category'],
        ['Pedidos de remoção', pending_request_count('removal'), 'a7r-requests&kind=removal'],
    ];
    echo '<ul>';
    foreach ($links as [$label, $count, $page]) {
        echo '<li><a href="' . esc_url(admin_url('admin.php?page=' . $page)) . '">' . esc_html($label) . '</a> <strong>' . esc_html((int) $count) . '</strong></li>';
    }
    echo '</ul>';
    $rows = $wpdb->get_results("SELECT id, state FROM $table WHERE pending = 1 ORDER BY submitted_at, id LIMIT 4", ARRAY_A);
    if (!$rows) return;
    echo '<h3>Rádios aguardando análise</h3><ul>';
    foreach ($rows as $row) {
        echo '<li><a href="' . esc_url(admin_url('admin.php?page=a7r&radio=' . $row['id'])) . '">' .
            esc_html(state($row)['revision']['fields']['name']) . '</a></li>';
    }
    echo '</ul>';
}
