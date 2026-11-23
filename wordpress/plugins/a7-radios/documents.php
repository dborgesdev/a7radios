<?php
namespace A7Radios;
defined('ABSPATH') || exit;

function document_html(array $entry): string {
    if (($entry['format'] ?? '') !== 'markdown') {
        return wpautop(esc_html($entry['content']));
    }
    $blocks = preg_split('/\R\s*\R/', trim($entry['content']));
    $html = '';
    $index = 0;
    foreach ($blocks as $block) {
        $lines = preg_split('/\R/', $block);
        for ($i = 0, $count = count($lines); $i < $count;) {
            $line = $lines[$i];
            if (preg_match('/^(#{1,6})\s+(.+)$/u', $line, $match)) {
                $level = min(6, strlen($match[1]) + 1);
                $anchor = 'secao-' . ++$index;
                $html .= "<h$level id=\"$anchor\">" . document_inline($match[2]) . "</h$level>";
                ++$i;
            } elseif (preg_match('/^(?:[-*] |\d+\. ).+$/u', $line, $match)) {
                $list = ctype_digit($match[0][0]) ? 'ol' : 'ul';
                $pattern = $list === 'ol' ? '/^\d+\. (.+)$/' : '/^[-*] (.+)$/';
                $html .= "<$list>";
                while ($i < $count && preg_match($pattern, $lines[$i], $item)) {
                    $html .= '<li>' . document_inline($item[1]) . '</li>';
                    ++$i;
                }
                $html .= "</$list>";
            } else {
                $html .= '<p>' . document_inline($line) . '</p>';
                ++$i;
            }
        }
    }
    return $html;
}

function document_inline(string $text): string {
    return preg_replace_callback('/\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/u',
        static function ($match) {
            if (!empty($match[1])) return '<strong>' . $match[1] . '</strong>';
            if (!empty($match[2])) return '<em>' . $match[2] . '</em>';
            if (!empty($match[3])) return '<code>' . $match[3] . '</code>';
            return '<a href="' . esc_url(html_entity_decode($match[5], ENT_QUOTES, 'UTF-8'), ['http', 'https']) . '">' . $match[4] . '</a>';
        }, esc_html($text)) ?? esc_html($text);
}

function public_document(string $key): ?array {
    $entry = legal($key);
    if (!$entry) return null;
    return ['version' => $entry['version'], 'content' => $entry['content'], 'html' => document_html($entry)];
}

add_action('wp_ajax_a7r_document_preview', static function () {
    require_moderator();
    check_ajax_referer('a7r_document_preview');
    $content = form_value('content');
    if (strlen($content) > 120000) wp_send_json_error(null, 422);
    wp_send_json_success(document_html(['content' => $content, 'format' => 'markdown']));
});

function document_history(string $key, string $current): void {
    global $wpdb;
    $prefix = $wpdb->esc_like('a7r_legal_' . $key . '_') . '%';
    $records = $wpdb->get_col($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name LIKE %s ORDER BY option_id DESC LIMIT 100", $prefix));
    foreach ($records as $value) {
        $entry = maybe_unserialize($value);
        if (!is_array($entry) || empty($entry['version']) || !isset($entry['content']) || $entry['version'] === $current) continue;
        echo '<details class="a7r-history"><summary>Versão ' . esc_html($entry['version']) .
            '</summary>' . document_html($entry) . '</details>';
    }
}
