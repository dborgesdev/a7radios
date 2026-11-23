<?php
namespace A7Radios;
defined('ABSPATH') || exit;

const REST = 'a7-radios/v1';

function register_api(): void {
    $routes = [
        ['/radios', 'GET', 'catalog', '__return_true'],
        ['/radios/(?P<slug>[a-z0-9-]{1,180})', 'GET', 'radio_detail', '__return_true'],
        ['/radios/(?P<id>\d+)/visit', 'POST', 'visit', __NAMESPACE__ . '\origin_permission'],
        ['/radios/(?P<id>\d+)/removal', 'POST', 'request_removal', __NAMESPACE__ . '\origin_permission'],
        ['/me/category-suggestions', 'POST', 'suggest_category', __NAMESPACE__ . '\write_permission'],
        ['/categories', 'GET', 'public_categories', '__return_true'],
        ['/discovery', 'GET', 'discovery', '__return_true'],
        ['/me/radios/(?P<id>\d+)/removal', 'POST', 'request_removal', __NAMESPACE__ . '\write_permission'],
        ['/me/profile', 'GET', 'owner_profile', __NAMESPACE__ . '\owner_permission'],
        ['/me/profile', 'POST', 'update_profile', __NAMESPACE__ . '\write_permission'],
        ['/me/categories', 'GET', 'category_options', __NAMESPACE__ . '\owner_permission'],
        ['/me/submission-settings', 'GET', static fn() => ['remoteImages' => remote_images_enabled(), 'terms' => public_document('terms')], __NAMESPACE__ . '\owner_permission'],
        ['/terms', 'GET', static fn() => public_document('terms'), '__return_true'],
        ['/privacy', 'GET', static fn() => public_document('privacy'), '__return_true'],
        ['/images/(?P<id>\d+)/(?P<asset>[a-f0-9]{48})', 'GET', 'public_image', '__return_true'],
        ['/me/radios', 'GET', 'owner_radios', __NAMESPACE__ . '\owner_permission'],
        ['/me/radios', 'POST', 'submit_radio', __NAMESPACE__ . '\write_permission'],
        ['/me/radios/(?P<id>\d+)', 'GET', 'owner_radios', __NAMESPACE__ . '\owner_permission'],
        ['/me/radios/(?P<id>\d+)/revisions', 'POST', 'submit_radio', __NAMESPACE__ . '\write_permission'],
        ['/me/radios/(?P<id>\d+)/image/(?P<asset>[a-f0-9]{48})', 'GET', 'owner_image', __NAMESPACE__ . '\owner_permission'],
        ['/me/dashboard', 'GET', 'dashboard', __NAMESPACE__ . '\owner_permission'],
    ];
    foreach ($routes as [$route, $method, $callback, $permission]) {
        register_rest_route(REST, $route, [
            'methods' => $method,
            'callback' => is_string($callback) ? __NAMESPACE__ . '\\' . $callback : $callback,
            'permission_callback' => $permission,
        ]);
    }
}

add_filter('rest_post_dispatch', static function ($response, $server, $request) {
    $route = $request->get_route();
    if (!str_starts_with($route, '/' . REST . '/')) return $response;
    if (str_starts_with($route, '/' . REST . '/me/') || str_ends_with($route, '/removal') || str_ends_with($route, '/visit')) {
        $response->header('Cache-Control', 'private, no-store, max-age=0');
    } else {
        $response->header('Cache-Control', 'no-cache');
    }
    $response->header('X-Robots-Tag', 'noindex');
    return $response;
}, 10, 3);

add_filter('rest_pre_serve_request', static function ($served, $result, $request) {
    // Core emits CORS headers at priority 10. A7 only serves same-origin clients.
    if (str_starts_with($request->get_route(), '/' . REST . '/')) {
        header_remove('Access-Control-Allow-Origin');
        header_remove('Access-Control-Allow-Credentials');
    }
    return $served;
}, 20, 3);

function origin_permission(): bool|\WP_Error {
    return same_origin() ?: err('Origem não autorizada.', 403);
}

function owner_permission(\WP_REST_Request $request): bool|\WP_Error {
    if (!is_user_logged_in()) return err('Entre na sua conta.', 401);
    if (!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest') || !current_user_can('a7r_submit')) {
        return err('Você não tem permissão para esta ação.', 403);
    }
    return true;
}

function write_permission(\WP_REST_Request $request): bool|\WP_Error {
    $permission = owner_permission($request);
    return is_wp_error($permission) ? $permission : origin_permission();
}

function catalog(\WP_REST_Request $request): array {
    global $wpdb;
    $table = table();
    $page = min(100000, max(1, (int) ($request['page'] ?? 1)));
    $limit = min(50, max(1, (int) ($request['per_page'] ?? 20)));
    $where = "status = 'approved'";
    $search = is_string($request['search']) ? sanitize_text_field(substr($request['search'], 0, 300)) : '';
    if ($search !== '') {
        $pattern = '%' . $wpdb->esc_like($search) . '%';
        $where .= $wpdb->prepare(" AND (published_name LIKE %s OR category_name LIKE %s OR JSON_UNQUOTE(JSON_EXTRACT(state, '$.published.city')) LIKE %s)", $pattern, $pattern, $pattern);
    }
    if (is_string($request['category']) && $request['category'] !== '') {
        $where .= $wpdb->prepare(' AND category_slug = %s', substr($request['category'], 0, 200));
    }
    if (is_string($request['slugs'])) {
        $slugs = array_values(array_filter(array_slice(explode(',', $request['slugs']), 0, 50),
            static fn($slug) => preg_match('/^[a-z0-9-]{1,180}$/D', $slug)));
        $where .= $slugs ? $wpdb->prepare(' AND slug IN (' . implode(',', array_fill(0, count($slugs), '%s')) . ')', ...$slugs) : ' AND 1 = 0';
    }
    $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE $where");
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM $table WHERE $where ORDER BY approved_at DESC, id DESC LIMIT %d OFFSET %d",
        $limit, ($page - 1) * $limit
    ), ARRAY_A);
    return ['items' => array_map(__NAMESPACE__ . '\public_radio', $rows), 'page' => $page,
        'perPage' => $limit, 'total' => $total, 'totalPages' => (int) ceil($total / $limit)];
}

function radio_detail(\WP_REST_Request $request): array|\WP_Error {
    return public_by_slug($request->get_url_params()['slug']) ?? err('Rádio indisponível.', 404);
}

function public_categories(): array {
    global $wpdb;
    $table = table();
    $groups = $wpdb->get_results("SELECT MIN(category) AS id, category_slug AS slug, MIN(category_name) AS name,
        COUNT(*) AS count FROM $table WHERE status = 'approved' GROUP BY category_slug ORDER BY name", ARRAY_A);
    return array_map(static fn($row) => array_merge($row, ['id' => (int) $row['id'], 'count' => (int) $row['count']]), $groups);
}

function discovery(): array {
    global $wpdb;
    $table = table();
    $latest = $wpdb->get_results("SELECT * FROM $table WHERE status = 'approved' ORDER BY approved_at DESC, id DESC LIMIT 10", ARRAY_A);
    $suggested = $wpdb->get_results("SELECT * FROM $table WHERE status = 'approved' ORDER BY RAND() LIMIT 30", ARRAY_A);
    return ['latest' => array_map(__NAMESPACE__ . '\public_radio', $latest), 'suggested' => array_map(__NAMESPACE__ . '\public_radio', $suggested)];
}

function visit(\WP_REST_Request $request): \WP_REST_Response|\WP_Error {
    global $wpdb;
    $row = row_by_id((int) $request->get_url_params()['id']);
    if (!$row || $row['status'] !== 'approved') return err('Rádio indisponível.', 404);
    $count = (int) $row['visits'];
    if (permit('visit-global', ip(), 30, 900) && permit('visit:' . $row['id'], ip(), 1, 1800)) {
        $table = table();
        if ($wpdb->query($wpdb->prepare("UPDATE $table SET visits = visits + 1 WHERE id = %d AND status = 'approved'", $row['id']))) {
            $count = (int) $wpdb->get_var($wpdb->prepare("SELECT visits FROM $table WHERE id = %d", $row['id']));
        }
    }
    $response = new \WP_REST_Response(null, 204);
    $response->header('X-A7-Visit-Count', (string) $count);
    return $response;
}

function public_image(\WP_REST_Request $request): \WP_Error {
    $params = $request->get_url_params();
    $row = row_by_id((int) $params['id']);
    if (!$row || $row['status'] !== 'approved' || state($row)['published']['asset'] !== $params['asset']) return err('Imagem indisponível.', 404);
    return image_output($params['asset'], true);
}

function owner_row(int $id): array|\WP_Error {
    $row = row_by_id($id);
    return $row && (int) $row['owner'] === get_current_user_id() ? $row : err('Rádio indisponível.', 404);
}

function owner_radios(\WP_REST_Request $request): array|\WP_Error {
    $id = $request->get_url_params()['id'] ?? null;
    if ($id !== null) {
        $row = owner_row((int) $id);
        if (is_wp_error($row)) return $row;
        $removal = request_record('removal', removal_key((int) $id, get_current_user_id()));
        return own_radio($row) + ['removalStatus' => $removal['status'] ?? null];
    }
    return array_map(__NAMESPACE__ . '\own_radio', rows_for_owner(get_current_user_id()));
}

function dashboard(): array {
    $counts = array_fill_keys(['pending', 'approved', 'rejected', 'archived'], 0);
    foreach (rows_for_owner(get_current_user_id()) as $row) ++$counts[$row['status']];
    return $counts;
}

function submit_radio(\WP_REST_Request $request): \WP_REST_Response|\WP_Error {
    $owner = get_current_user_id();
    $route_id = $request->get_url_params()['id'] ?? null;
    $row = $route_id !== null ? owner_row((int) $route_id) : null;
    if (is_wp_error($row)) return $row;
    if ($row && ($row['status'] === 'archived' || $row['pending'])) return err('Esta rádio não aceita uma nova revisão agora.', 409);
    $data = $row ? state($row) : null;
    $key = $request['submissionKey'];
    if (!$row) {
        if (!is_string($key) || !preg_match('/^[a-f0-9-]{36}$/D', $key)) return err('Identificador de envio inválido.', 422);
        $saved = submission_row($owner, $key);
        if ($saved) return new \WP_REST_Response(own_radio($saved), 200);
    }
    $base = (int) ($row['version'] ?? 0);
    if ($row && ((string) $base !== $request['version'] || (string) $data['revision']['id'] !== $request['revisionId'])) {
        return err('A rádio mudou. Reabra o formulário antes de enviar.', 409);
    }
    if (!permit('submit', (string) $owner, 12, 900)) return err('Muitos envios. Tente novamente em alguns minutos.', 429);
    $terms = legal('terms');
    if (!$terms || $request['termsVersion'] !== $terms['version'] || $request['accepted'] !== '1') {
        return err('Aceite a versão vigente do Termo de Responsabilidade.', 422);
    }
    $suggestion_id = $request['categorySuggestion'];
    $suggestion = null;
    if ($suggestion_id !== null && $suggestion_id !== '') {
        if (!is_string($suggestion_id) || !preg_match('/^[a-f0-9]{64}$/D', $suggestion_id)) return err('Sugestão inválida.', 422, 'categoryId');
        $suggestion = request_record('category', $suggestion_id);
        if (!$suggestion || (int) $suggestion['owner'] !== $owner || $suggestion['status'] === 'rejected') {
            return err('A sugestão está indisponível. Escolha uma categoria.', 422, 'categoryId');
        }
    }
    $fields = validate_fields($request, $suggestion);
    if (is_wp_error($fields)) return $fields;
    $previous = $data['revision']['fields']['asset'] ?? null;
    $asset = save_image($request, $previous);
    if (is_wp_error($asset)) return $asset;
    $fields['asset'] = $asset;
    $revision = [
        'id' => (int) ($row['sequence'] ?? 0) + 1, 'base' => $base, 'fields' => $fields,
        'submittedBy' => $owner, 'submittedAt' => gmdate(DATE_ATOM), 'status' => 'pending',
        'acceptance' => ['version' => $terms['version'], 'hash' => hash('sha256', $terms['content']),
            'user' => $owner, 'at' => gmdate(DATE_ATOM)],
    ];
    if ($suggestion) $revision['categorySuggestion'] = ['id' => $suggestion_id, 'name' => $suggestion['name']];
    if ($row) {
        $data['revision'] = $revision;
        $id = change_radio($row, $data, [
            'pending' => 1, 'status' => $base ? 'approved' : 'pending', 'submitted_at' => gmdate('Y-m-d H:i:s'),
        ]) ? (int) $row['id'] : err('A rádio mudou. Atualize a página.', 409);
    } else {
        $id = create_radio($owner, $key, $revision);
    }
    if (is_wp_error($id)) {
        if ($asset !== $previous) remove_unreferenced_image($asset);
        $saved = !$row ? submission_row($owner, $key) : null;
        return $saved ? new \WP_REST_Response(own_radio($saved), 200) : $id;
    }
    return new \WP_REST_Response(own_radio(row_by_id($id)), 201);
}

function validate_fields(\WP_REST_Request $request, ?array $suggestion = null): array|\WP_Error {
    $fields = [];
    foreach (['name' => 100, 'country' => 80, 'region' => 80, 'city' => 100, 'description' => 2000] as $key => $limit) {
        $value = $request[$key] ?? '';
        if (!is_string($value)) return err('Campo inválido.', 422, $key);
        $value = $key === 'description' ? sanitize_textarea_field($value) : sanitize_text_field($value);
        $length = function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
        if ((!in_array($key, ['region', 'city'], true) && $value === '') || $length > $limit) return err('Preencha o campo dentro do limite de ' . $limit . ' caracteres.', 422, $key);
        $fields[$key] = $value;
    }
    if ($fields['country'] === 'Brasil' && !in_array($fields['region'], explode(' ', 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'), true)) {
        return err('Selecione um estado brasileiro.', 422, 'region');
    }
    if ($fields['country'] === 'Outro' && $fields['region'] === '') return err('Informe a região ou localidade.', 422, 'region');
    foreach (['streamUrl', 'websiteUrl', 'appDownloadUrl'] as $key) {
        $value = $request[$key] ?? '';
        if (!is_string($value) || (($key === 'streamUrl' || $value !== '') && !external_url($value))) {
            return err('Informe um endereço HTTPS público válido.', 422, $key);
        }
        $fields[$key] = $value;
    }
    $raw = $request['categoryId'];
    $term = is_scalar($raw) && ctype_digit((string) $raw) ? get_term((int) $raw, 'a7_radio_category') : null;
    if (($raw === null || $raw === '' || $raw === '0') && $suggestion) {
        $existing = get_term_by('slug', $suggestion['slug'], 'a7_radio_category');
        if ($existing) $term = $existing;
        else return $fields + ['categoryId' => 0, 'category' => ['id' => 0, 'slug' => '', 'name' => $suggestion['name']]];
    }
    if (!$term || is_wp_error($term)) return err('Selecione uma categoria válida.', 422, 'categoryId');
    $fields['categoryId'] = $term->term_id;
    $fields['category'] = category_payload($term);
    return $fields;
}

function owner_image(\WP_REST_Request $request): \WP_Error {
    $params = $request->get_url_params();
    $row = owner_row((int) $params['id']);
    if (is_wp_error($row)) return $row;
    $asset = state($row)['revision']['fields']['asset'] ?? '';
    if (!$asset || !hash_equals($asset, $params['asset'])) return err('Imagem indisponível.', 404);
    return image_output($asset, false);
}
