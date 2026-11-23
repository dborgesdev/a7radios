<?php
namespace A7Radios;
defined('ABSPATH') || exit;

function table(): string {
    global $wpdb;
    return $wpdb->prefix . 'a7r_catalog';
}

function limits_table(): string {
    global $wpdb;
    return $wpdb->prefix . 'a7r_limits';
}

function install(): void {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $table = table();
    $limits = limits_table();
    $charset = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $table (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        owner bigint unsigned NOT NULL,
        submission_key char(36) NOT NULL,
        slug varchar(180) NOT NULL,
        status varchar(12) NOT NULL,
        version bigint unsigned NOT NULL DEFAULT 0,
        sequence bigint unsigned NOT NULL DEFAULT 1,
        pending tinyint unsigned NOT NULL DEFAULT 1,
        category bigint unsigned NOT NULL DEFAULT 0,
        published_name varchar(100) NOT NULL DEFAULT '',
        category_slug varchar(200) NOT NULL DEFAULT '',
        category_name varchar(200) NOT NULL DEFAULT '',
        approved_at datetime DEFAULT NULL,
        updated_at datetime DEFAULT NULL,
        submitted_at datetime NOT NULL,
        visits bigint unsigned NOT NULL DEFAULT 0,
        state longtext NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY slug (slug),
        KEY owner (owner,id),
        UNIQUE KEY submission (owner,submission_key),
        KEY catalog (status,approved_at,id),
        KEY category (status,category,approved_at,id),
        KEY queue (pending,submitted_at,id)
    ) ENGINE=InnoDB $charset;");
    dbDelta("CREATE TABLE $limits (
        bucket char(64) NOT NULL,
        hits int unsigned NOT NULL DEFAULT 1,
        expires bigint unsigned NOT NULL,
        PRIMARY KEY  (bucket),
        KEY expires (expires)
    ) ENGINE=InnoDB $charset;");
    foreach ([$table, $limits] as $required_table) {
        $details = $wpdb->get_row($wpdb->prepare(
            'SHOW TABLE STATUS LIKE %s',
            $wpdb->esc_like($required_table)
        ));
        if (!$details || strcasecmp($details->Engine ?? '', 'InnoDB') !== 0) {
            wp_die('A7 Rádios precisa criar as tabelas do plugin com InnoDB. Confira as permissões do banco.', '', ['response' => 500]);
        }
    }
    add_role('a7r_owner', 'Proprietário de rádio', ['read' => true, 'a7r_submit' => true]);
    $admin = get_role('administrator');
    if ($admin) {
        $admin->add_cap('a7r_moderate');
        $admin->add_cap('a7r_submit');
    }
    if (!wp_next_scheduled('a7r_cleanup_limits')) wp_schedule_event(time(), 'hourly', 'a7r_cleanup_limits');
    private_dir(true);
}

function cleanup_limits(): void {
    global $wpdb;
    $table = limits_table();
    $wpdb->query($wpdb->prepare("DELETE FROM $table WHERE expires < %d", time()));
}

// LAST_INSERT_ID is connection-local. The upsert reserves the hit atomically.
function permit(string $area, string $actor, int $limit, int $seconds): bool {
    global $wpdb;
    $table = limits_table();
    $slot = intdiv(time(), $seconds);
    $key = hash_hmac('sha256', "$area:$slot:$actor", wp_salt('nonce'));
    $result = $wpdb->query($wpdb->prepare(
        "INSERT INTO $table (bucket, hits, expires) VALUES (%s, LAST_INSERT_ID(1), %d)
         ON DUPLICATE KEY UPDATE hits = LAST_INSERT_ID(hits + 1)",
        $key, ($slot + 1) * $seconds + 60
    ));
    return $result !== false && (int) $wpdb->insert_id <= $limit;
}

function ip(): string {
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'local');
}

function row_by_id(int $id): ?array {
    global $wpdb;
    $table = table();
    return $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE id = %d", $id), ARRAY_A);
}

function state(array $row): array {
    return json_decode($row['state'], true, 512, JSON_THROW_ON_ERROR);
}

function rows_for_owner(int $owner): array {
    global $wpdb;
    $table = table();
    return $wpdb->get_results($wpdb->prepare("SELECT * FROM $table WHERE owner = %d ORDER BY id DESC", $owner), ARRAY_A);
}

function published_time(string $value): string {
    return gmdate(DATE_ATOM, strtotime($value . ' UTC'));
}

function public_radio(array $row): array {
    $fields = state($row)['published'];
    $asset = $fields['asset'];
    unset($fields['asset'], $fields['categoryId']);
    return $fields + [
        'id' => (int) $row['id'],
        'slug' => $row['slug'],
        'image' => [
            'url' => origin() . '/app/wp-json/a7-radios/v1/images/' . $row['id'] . '/' . $asset,
            'width' => 512, 'height' => 512, 'alt' => 'Logo de ' . $fields['name'],
        ],
        'approvedUpdatedAt' => published_time($row['updated_at']),
        'visitCount' => (int) $row['visits'],
    ];
}

function public_by_slug(string $slug): ?array {
    global $wpdb;
    $table = table();
    $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE slug = %s AND status = 'approved'", $slug), ARRAY_A);
    return $row ? public_radio($row) : null;
}

function own_radio(array $row): array {
    $data = state($row);
    $revision = $data['revision'];
    $draft = $revision['fields'];
    $asset = $draft['asset'];
    unset($draft['asset'], $draft['category']);
    return [
        'id' => (int) $row['id'], 'slug' => $row['slug'], 'status' => $row['status'],
        'version' => (int) $row['version'], 'revisionId' => $revision['id'],
        'imagePath' => '/app/wp-json/a7-radios/v1/me/radios/' . $row['id'] . '/image/' . $asset,
        'revisionStatus' => $revision['status'], 'submittedAt' => $revision['submittedAt'],
        'reason' => $revision['reason'] ?? '', 'categoryName' => $revision['fields']['category']['name'], 'draft' => $draft,
        'history' => array_map(static fn($item) => [
            'id' => $item['id'], 'status' => $item['status'], 'reason' => $item['reason'],
            'decidedAt' => $item['decidedAt'],
        ], $data['history']),
    ];
}

function create_radio(int $owner, string $key, array $revision): int|\WP_Error {
    global $wpdb;
    $base = substr(sanitize_title(remove_accents($revision['fields']['name'])), 0, 140);
    $base = trim(preg_replace('/[^a-z0-9-]/', '', $base), '-') ?: 'radio';
    $slug = $base . '-' . bin2hex(random_bytes(5));
    $previous = $wpdb->suppress_errors(true);
    $ok = $wpdb->insert(table(), [
        'owner' => $owner, 'submission_key' => $key, 'slug' => $slug, 'status' => 'pending', 'submitted_at' => gmdate('Y-m-d H:i:s'),
        'state' => wp_json_encode(['published' => null, 'revision' => $revision, 'history' => []]),
    ]);
    $wpdb->suppress_errors($previous);
    return $ok ? (int) $wpdb->insert_id : err('Não foi possível salvar o cadastro.', 503);
}

function submission_row(int $owner, string $key): ?array {
    global $wpdb;
    $table = table();
    return $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE owner = %d AND submission_key = %s", $owner, $key), ARRAY_A);
}

function change_radio(array $row, array $data, array $columns): bool {
    global $wpdb;
    // The state and all indexed projections are changed atomically. Visits have their own column.
    return 1 === $wpdb->update(table(), $columns + [
        'state' => wp_json_encode($data), 'sequence' => ((int) $row['sequence']) + 1,
    ], ['id' => (int) $row['id'], 'sequence' => (int) $row['sequence'], 'version' => (int) $row['version']]);
}

function category_payload(\WP_Term $term): array {
    return ['id' => $term->term_id, 'slug' => $term->slug, 'name' => $term->name];
}

function category_options(): array {
    $terms = get_terms(['taxonomy' => 'a7_radio_category', 'hide_empty' => false]);
    return is_wp_error($terms) ? [] : array_map(__NAMESPACE__ . '\category_payload', $terms);
}
