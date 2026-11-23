<?php
// Local PHP server only. Production delegates these requests with public/.htaccess.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = $_SERVER['DOCUMENT_ROOT'];
$resolved = realpath($root . rawurldecode($path));
$media = realpath($root . '/app/wp-content/a7-radios-media');
if (preg_match('#^/app/wp-content/a7-radios-media(?:/|$)#i', rawurldecode($path))
    || ($media && $resolved && stripos($resolved . DIRECTORY_SEPARATOR, $media . DIRECTORY_SEPARATOR) === 0)) {
    http_response_code(403);
    return;
}
if ($path === '/app') {
    header('Location: /app/', true, 301);
    return;
}
if ($path !== '/' && $path !== '/app/' && is_file($root . $path)) return false;
if (str_starts_with($path, '/app/wp-admin/') && is_dir($root . $path) && is_file($root . $path . '/index.php')) return false;

$frontend = '#^/(?:|radios/?|radio/[a-z0-9-]{1,180}/?|sitemap(?:-[0-9]+)?\.xml|robots\.txt|favoritos/?|login/?|cadastro/?|confirmar-email/?|recuperar-senha/?|termos/?|privacidade/?|painel(?:/dados|/radios(?:/nova|/[0-9]+/editar)?)?/?)$#D';
if (str_starts_with($path, '/app/') || preg_match($frontend, $path)) {
    $_SERVER['SCRIPT_NAME'] = '/app/index.php';
    $_SERVER['PHP_SELF'] = '/app/index.php';
    require $root . '/app/index.php';
    return;
}
http_response_code(404);
header('Content-Type: text/plain; charset=UTF-8');
echo "Página não encontrada.\n";
