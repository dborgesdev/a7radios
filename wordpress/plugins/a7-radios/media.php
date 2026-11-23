<?php
namespace A7Radios;
defined('ABSPATH') || exit;

const IMAGE_BYTES = 5 * 1024 * 1024;
const MEDIA_PROTECTION = "Require all denied\nOptions -Indexes -ExecCGI\nSetHandler none\n";
const MEDIA_ROOT_RULE = 'RewriteRule ^app/wp-content/a7-radios-media(?:/|$) - [F,NC]';

function remote_images_enabled(): bool {
    return defined('A7R_REMOTE_IMAGES') && A7R_REMOTE_IMAGES === true && function_exists('curl_init');
}

function external_url(string $url): ?string {
    if (strlen($url) > 2000 || preg_match('/[\x00-\x20\x7f\\\\]/', $url) || !filter_var($url, FILTER_VALIDATE_URL)) return null;
    $parts = wp_parse_url($url);
    if (($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) return null;
    $host = strtolower(trim($parts['host'], '[]'));
    if (filter_var($host, FILTER_VALIDATE_IP)) return public_ip($host) ? $url : null;
    return preg_match('/^[a-z0-9.-]+\.[a-z]{2,63}$/D', $host) &&
        !preg_match('/\.(?:localhost|local|internal|invalid|test|example)$/D', $host) ? $url : null;
}

function public_ip(string $ip): bool {
    return (bool) filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_GLOBAL_RANGE);
}

function private_dir(bool $prepare = false): ?string {
    $root = realpath(($_SERVER['DOCUMENT_ROOT'] ?? '') ?: frontend_dir());
    $content = realpath(WP_CONTENT_DIR);
    if (!$root || !$content || realpath($root . '/app/wp-content') !== $content) return null;

    $rules = @file_get_contents($root . '/.htaccess');
    if (!is_string($rules) || !preg_match('/^\h*(RewriteRule\h+[^\r\n]+)$/mi', $rules, $first_rule)
        || trim($first_rule[1]) !== MEDIA_ROOT_RULE) return null;

    $directory = wp_normalize_path($content) . '/a7-radios-media';
    if (is_link($directory)) return null;
    if ($prepare && !is_dir($directory)) @mkdir($directory, 0700);
    $resolved = realpath($directory);
    if (!$resolved || wp_normalize_path($resolved) !== $directory || !is_dir($directory)
        || !is_readable($directory) || ($prepare && !is_writable($directory))) return null;

    $guard = $directory . '/.htaccess';
    if ($prepare && !file_exists($guard) && !is_link($guard)) {
        $file = @fopen($guard, 'xb');
        if ($file) {
            $written = fwrite($file, MEDIA_PROTECTION);
            fclose($file);
            if ($written !== strlen(MEDIA_PROTECTION)) {
                @unlink($guard);
                return null;
            }
        }
    }
    if (is_link($guard) || !is_file($guard)
        || str_replace("\r\n", "\n", (string) @file_get_contents($guard)) !== MEDIA_PROTECTION) return null;
    return $directory;
}

function download_image(string $url, string $destination): bool {
    if (!remote_images_enabled() || !external_url($url)) return false;
    $parts = wp_parse_url($url);
    $host = strtolower($parts['host']);
    if (($parts['port'] ?? 443) !== 443 || !preg_match('/^[a-z0-9.-]+$/D', $host) || filter_var($host, FILTER_VALIDATE_IP)) return false;
    $addresses = gethostbynamel($host);
    if (!$addresses || array_filter($addresses, static fn($ip) => !public_ip($ip))) return false;

    // Pin the validated destination. Reject redirects, proxies, non-HTTPS and oversized bodies.
    $handle = @fopen($destination, 'xb');
    if (!$handle) return false;
    $curl = curl_init($url);
    $bytes = 0;
    curl_setopt_array($curl, [
        CURLOPT_RESOLVE => [$host . ':443:' . $addresses[0]],
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '',
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 8, CURLOPT_MAXFILESIZE => IMAGE_BYTES,
        CURLOPT_WRITEFUNCTION => static function ($request, string $chunk) use ($handle, &$bytes): int {
            $bytes += strlen($chunk);
            return $bytes > IMAGE_BYTES ? 0 : (int) fwrite($handle, $chunk);
        },
    ]);
    $ok = curl_exec($curl) && curl_getinfo($curl, CURLINFO_RESPONSE_CODE) === 200;
    curl_close($curl);
    fclose($handle);
    return $ok && $bytes > 0;
}

function save_image(\WP_REST_Request $request, ?string $previous): string|\WP_Error {
    $files = $request->get_file_params();
    $file = $files['image'] ?? null;
    if (is_array($file) && ($file['error'] ?? null) === UPLOAD_ERR_NO_FILE) $file = null;
    $remote = $request->get_param('imageUrl');
    if ($remote !== null && !is_string($remote)) return err('URL de imagem inválida.', 422, 'imageUrl');
    if (!$file && !$remote) return $previous ?: err('Envie uma imagem para a rádio.', 422, 'image');
    if ($file && $remote) return err('Escolha arquivo ou URL.', 422, 'image');
    $directory = private_dir(true);
    if (!$directory) return err('O armazenamento protegido de imagens está indisponível. Confirme as regras Apache e as permissões da pasta.', 503);
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $temporary = null;
    try {
        if ($remote) {
            if (!remote_images_enabled()) return err('Envie o arquivo. A importação por URL está desativada.', 422, 'imageUrl');
            $temporary = $directory . '/' . bin2hex(random_bytes(24)) . '.tmp';
            if (!download_image($remote, $temporary)) return err('Não foi possível importar a imagem HTTPS.', 422, 'imageUrl');
            $source = $temporary;
        } else {
            if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK ||
                !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])) {
                return err('Falha no envio da imagem.', 422, 'image');
            }
            $source = $file['tmp_name'];
        }
        $field = $remote ? 'imageUrl' : 'image';
        if (filesize($source) > IMAGE_BYTES) return err('A imagem excede 5 MB.', 422, $field);
        $size = @getimagesize($source);
        if (!$size || !in_array($size['mime'], ['image/jpeg', 'image/png', 'image/webp'], true) ||
            min($size[0], $size[1]) < 64 || max($size[0], $size[1]) > 4096 || $size[0] * $size[1] > 12000000) {
            return err('Use PNG, JPG ou WebP válido, de 64 a 4096 px por lado e até 12 megapixels.', 422, $field);
        }
        $editor = wp_get_image_editor($source);
        if (is_wp_error($editor)) return err('Não foi possível abrir a imagem.', 422, $field);
        $side = min($size[0], $size[1]);
        $result = $editor->crop((int) (($size[0] - $side) / 2), (int) (($size[1] - $side) / 2), $side, $side, 512, 512);
        if (is_wp_error($result)) return err('Não foi possível recortar a imagem.', 422, $field);
        // Re-encode and strip source metadata. No original is persisted.
        $asset = bin2hex(random_bytes(24));
        $path = $directory . '/' . $asset . '.png';
        $result = $editor->save($path, 'image/png');
        if (is_wp_error($result)) return err('Não foi possível salvar a imagem.', 503);
        if ((int) $result['width'] !== 512 || (int) $result['height'] !== 512) {
            wp_delete_file($path);
            return err('Não foi possível gerar a imagem quadrada.', 422, $field);
        }
        @chmod($path, 0600);
        return $asset;
    } finally {
        if ($temporary && is_file($temporary)) wp_delete_file($temporary);
    }
}

function remove_unreferenced_image(string $asset): void {
    $directory = private_dir();
    if ($directory && preg_match('/^[a-f0-9]{48}$/D', $asset)) wp_delete_file("$directory/$asset.png");
}

function image_output(string $asset, bool $public): \WP_Error {
    if (!preg_match('/^[a-f0-9]{48}$/D', $asset)) return err('Imagem indisponível.', 404);
    $directory = private_dir();
    $path = $directory ? "$directory/$asset.png" : '';
    if (!$path || is_link($path) || !is_file($path) || !is_readable($path)) return err('Imagem indisponível.', 404);
    if ($public) header('Cache-Control: public, max-age=0, must-revalidate');
    else no_store();
    header('Content-Type: image/png');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($path));
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') readfile($path);
    exit;
}
