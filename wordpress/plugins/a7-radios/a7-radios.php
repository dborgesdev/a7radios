<?php
/**
 * Plugin Name: A7 Rádios On-Line
 * Description: Catálogo, proprietários, moderação e páginas públicas A7.
 * Version: 2.2.0
 * Requires at least: 6.6
 * Requires PHP: 8.2
 */
namespace A7Radios;
defined('ABSPATH') || exit;

require __DIR__ . '/store.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/accounts.php';
require __DIR__ . '/media.php';
require __DIR__ . '/api.php';
require __DIR__ . '/admin.php';
require __DIR__ . '/admin-catalog.php';
require __DIR__ . '/delete-radio.php';
require __DIR__ . '/documents.php';
require __DIR__ . '/requests.php';
require __DIR__ . '/public.php';

register_activation_hook(__FILE__, __NAMESPACE__ . '\install');
add_action('init', __NAMESPACE__ . '\register_categories');
add_action('rest_api_init', __NAMESPACE__ . '\register_api');
add_action('admin_menu', __NAMESPACE__ . '\register_admin');
add_action('parse_request', __NAMESPACE__ . '\render_route', 1);
add_action('a7r_cleanup_limits', __NAMESPACE__ . '\cleanup_limits');
register_deactivation_hook(__FILE__, static function () { wp_clear_scheduled_hook('a7r_cleanup_limits'); });

function origin(): string {
    if (defined('A7R_ORIGIN')) return rtrim(A7R_ORIGIN, '/');
    return 'https://a7radios.com.br';
}

function index_enabled(): bool {
    return wp_get_environment_type() === 'production' && defined('A7R_INDEX') && A7R_INDEX === true
        && (bool) get_option('blog_public') && legal('terms') && legal('privacy');
}

function no_store(): void {
    nocache_headers();
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Robots-Tag: noindex, nofollow');
}

function same_origin(): bool {
    return isset($_SERVER['HTTP_ORIGIN']) && hash_equals(origin(), (string) $_SERVER['HTTP_ORIGIN']);
}

function register_categories(): void {
    register_post_type('a7_radio', ['public' => false, 'show_ui' => false, 'supports' => ['title']]);
    register_taxonomy('a7_radio_category', ['a7_radio'], [
        'labels' => ['name' => 'Categorias de rádios', 'singular_name' => 'Categoria de rádio'],
        'public' => false, 'show_ui' => true, 'show_in_menu' => false,
        'capabilities' => array_fill_keys(['manage_terms', 'edit_terms', 'delete_terms', 'assign_terms'], 'a7r_moderate'),
    ]);
}

function legal(string $key): ?array {
    $setting = get_option('a7r_' . $key);
    return is_array($setting) && !empty($setting['version']) && !empty($setting['content']) ? $setting : null;
}

function err(string $message, int $status, ?string $field = null): \WP_Error {
    return new \WP_Error('a7r_request', $message, ['status' => $status, 'field' => $field]);
}
