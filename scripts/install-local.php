<?php
// Run once with a new local-only database and the plugin copied into wp-content/plugins.
if (PHP_SAPI !== 'cli' || count($argv) !== 2) exit("Usage: php scripts/install-local.php <path-to-wordpress>\n");
define('WP_INSTALLING', true);
require rtrim($argv[1], '/\\') . '/wp-load.php';
if (wp_get_environment_type() !== 'local') exit("Set WP_ENVIRONMENT_TYPE to local first.\n");
require_once ABSPATH . 'wp-admin/includes/upgrade.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
if (is_blog_installed()) exit("WordPress is already installed.\n");
$admin = 'a7localadmin';
$admin_email = 'a7-admin@example.test';
$password = bin2hex(random_bytes(14));
add_filter('pre_wp_mail', '__return_true');
wp_install('WordPress local A7', $admin, $admin_email, false, '', $password);
update_option('home', A7R_ORIGIN . '/app');
update_option('siteurl', A7R_ORIGIN . '/app');
update_option('permalink_structure', '/%postname%/');
update_option('blog_public', 0);
$activation = activate_plugin('a7-radios/a7-radios.php');
if (is_wp_error($activation)) exit($activation->get_error_message() . "\n");
\A7Radios\register_categories();
$term = wp_insert_term('Música DEMO', 'a7_radio_category');
if (is_wp_error($term)) exit($term->get_error_message() . "\n");
update_option('a7r_terms', ['version' => 'demo-1', 'content' => 'DEMO local para testar o registro de aceite.'], false);
if (!is_dir(WPMU_PLUGIN_DIR)) wp_mkdir_p(WPMU_PLUGIN_DIR);
copy(__DIR__ . '/local-mail-fixture.php', WPMU_PLUGIN_DIR . '/a7-local-mail.php');
$path = dirname(rtrim($argv[1], '/\\'), 2) . '/local-admin.json';
file_put_contents($path, json_encode(['email' => $admin_email, 'password' => $password, 'categoryId' => $term['term_id']]));
echo "WordPress instalado. Credenciais locais em local-admin.json, fora do document root.\n";
