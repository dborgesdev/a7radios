<?php
/**
 * Plugin Name: A7 — captura de recuperação local
 */
if (!defined('ABSPATH') || wp_get_environment_type() !== 'local') return;
add_filter('pre_wp_mail', static function ($send, array $message) {
    $to = $message['to'];
    if (is_array($to)) $to = reset($to);
    if (!is_string($to) || !str_ends_with($to, '@example.test')) return false;
    $path = dirname(rtrim(ABSPATH, '/\\'), 2) . '/mail';
    if (!is_dir($path) && !wp_mkdir_p($path)) return false;
    return file_put_contents($path . '/' . hash('sha256', strtolower($to)) . '.txt', $message['message'], LOCK_EX) !== false;
}, 10, 2);
