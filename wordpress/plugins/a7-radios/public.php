<?php
namespace A7Radios;
defined('ABSPATH') || exit;

function radio_url(string $slug): string {
    return origin() . '/radio/' . $slug . '/';
}

function frontend_dir(): string {
    if (defined('A7R_FRONTEND_DIR')) return rtrim(A7R_FRONTEND_DIR, '/\\');
    $root = $_SERVER['DOCUMENT_ROOT'] ?? '';
    return rtrim($root ?: dirname(rtrim(ABSPATH, '/\\')), '/\\');
}

function render_route(): void {
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true)) return;
    $path = wp_parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    if (!is_string($path) || str_starts_with($path, '/app/')) return;

    if ($path === '/robots.txt') robots();
    if (preg_match('#^/sitemap(?:-([1-9][0-9]{0,5}))?\.xml$#D', $path, $matches)) sitemap((int) ($matches[1] ?? 0));

    if (preg_match('#^/radio/([a-z0-9-]{1,180})/?$#D', $path, $matches)) {
        $radio = public_by_slug($matches[1]);
        if (!$radio) {
            html_page('Rádio indisponível', 'Esta rádio não está disponível.', null, false, 404);
        }
        if (!str_ends_with($path, '/')) {
            no_store();
            wp_redirect(radio_url($radio['slug']), 301, 'A7 Rádios');
            exit;
        }
        $description = wp_html_excerpt(preg_replace('/\s+/', ' ', $radio['description']), 155, '…');
        html_page($radio['name'] . ' | A7 Rádios', $description, radio_url($radio['slug']), index_enabled(), 200, $radio);
    }

    $routes = [
        '/' => 'A7 Rádios On-Line | Do Brasil para o mundo',
        '/radios' => 'Rádios | A7 Rádios',
        '/favoritos' => 'Favoritos | A7 Rádios',
        '/login' => 'Entrar | A7 Rádios',
        '/cadastro' => 'Criar conta | A7 Rádios',
        '/recuperar-senha' => 'Recuperar senha | A7 Rádios',
        '/termos' => 'Termo de Responsabilidade | A7 Rádios',
        '/privacidade' => 'Privacidade | A7 Rádios',
    ];
    $route = $path === '/' ? '/' : rtrim($path, '/');
    $is_owner = preg_match('#^/painel(?:/radios(?:/nova|/[0-9]+/editar)?)?$#D', $route);
    if (!isset($routes[$route]) && !$is_owner) return;
    $is_catalog = in_array($route, ['/', '/radios'], true);
    $index = $is_catalog && empty($_SERVER['QUERY_STRING']) && index_enabled() && has_published();
    $canonical = $is_catalog ? origin() . ($route === '/' ? '/' : '/radios/') : null;
    html_page($routes[$route] ?? 'Painel | A7 Rádios',
        'Encontre rádios online e ouça suas emissoras favoritas em um só lugar.', $canonical, $index, 200, null, $route);
}

function has_published(): bool {
    global $wpdb;
    $table = table();
    return (bool) $wpdb->get_var("SELECT 1 FROM $table WHERE status = 'approved' LIMIT 1");
}

function front_assets(): array {
    $path = frontend_dir() . '/.vite/manifest.json';
    if (!is_readable($path)) return [];
    $manifest = json_decode(file_get_contents($path), true);
    return $manifest['index.html'] ?? [];
}

function html_page(string $title, string $description, ?string $canonical, bool $index, int $status, ?array $radio = null, string $route = ''): never {
    status_header($status);
    if (!$index) no_store();
    else header('Cache-Control: public, max-age=0, must-revalidate');
    header('Content-Type: text/html; charset=UTF-8');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    if ($route === '/recuperar-senha') header('Referrer-Policy: no-referrer');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') exit;
    $image = $radio ? $radio['image']['url'] : origin() . '/a7-og.jpg';
    $assets = front_assets();
    $body_title = explode(' | ', $title, 2)[0];
    ?>
<!doctype html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#fbf9f6">
<title><?= esc_html($title) ?></title>
<meta name="description" content="<?= esc_attr($description) ?>">
<meta name="robots" content="<?= $index ? 'index, follow' : 'noindex, nofollow' ?>">
<link rel="icon" href="/a7-icon.png">
<?php if ($canonical): ?>
<link rel="canonical" href="<?= esc_url($canonical) ?>">
<meta property="og:type" content="website">
<meta property="og:site_name" content="A7 Rádios On-Line">
<meta property="og:title" content="<?= esc_attr($title) ?>">
<meta property="og:description" content="<?= esc_attr($description) ?>">
<meta property="og:url" content="<?= esc_url($canonical) ?>">
<meta property="og:image" content="<?= esc_url($image) ?>">
<meta name="twitter:card" content="<?= $radio ? 'summary' : 'summary_large_image' ?>">
<meta name="twitter:title" content="<?= esc_attr($title) ?>">
<meta name="twitter:description" content="<?= esc_attr($description) ?>">
<meta name="twitter:image" content="<?= esc_url($image) ?>">
<?php if ($radio): ?>
<script type="application/ld+json"><?= script_json([
    '@context' => 'https://schema.org', '@type' => 'WebPage', 'url' => $canonical, 'name' => $radio['name'],
    'description' => $radio['description'], 'image' => $image, 'inLanguage' => 'pt-BR',
]) ?></script>
<?php endif; endif; ?>
<?php foreach ($assets['css'] ?? [] as $css): ?><link rel="stylesheet" href="/<?= esc_attr($css) ?>">
<?php endforeach; ?>
</head><body><div id="root">
<a class="skip" href="#conteudo">Ir para o conteúdo</a>
<header class="site-header"><div class="shell header-inner">
    <a class="brand" href="/"><img src="/a7-logo.png" width="100" height="69" alt="A7 Rádios On-Line"></a>
    <nav class="navigation static-nav" aria-label="Navegação principal"><a href="/">Início</a><a href="/radios/">Rádios</a><a href="/#categorias">Categorias</a></nav>
    <a class="account" href="/login/">Entrar</a>
</div></header>
<main id="conteudo" class="main shell page">
<?php if ($radio): ?>
    <nav class="breadcrumb" aria-label="Você está em"><a href="/">Início</a> / <a href="/radios/">Rádios</a></nav>
    <div class="radio-detail">
        <img class="cover" width="512" height="512" src="<?= esc_url($image) ?>" alt="<?= esc_attr($radio['image']['alt']) ?>">
        <div><p class="eyebrow"><a href="<?= esc_url(add_query_arg('category', $radio['category']['slug'], '/radios/')) ?>"><?= esc_html($radio['category']['name']) ?></a></p>
        <h1><?= esc_html($radio['name']) ?></h1>
        <p class="muted"><?= esc_html(implode(', ', array_filter([$radio['region'], $radio['country']]))) ?></p>
        <noscript><audio class="native-player" controls preload="none" src="<?= esc_url($radio['streamUrl']) ?>" aria-label="Ouvir rádio"></audio></noscript></div>
    </div>
    <section class="about"><h2>Sobre a rádio</h2><p><?= esc_html($radio['description']) ?></p>
        <div class="actions">
            <?php if ($radio['websiteUrl']): ?><a class="button secondary" href="<?= esc_url($radio['websiteUrl']) ?>" target="_blank" rel="noopener noreferrer">Visitar site da rádio</a><?php endif; ?>
            <?php if ($radio['appDownloadUrl']): ?><a class="button secondary" href="<?= esc_url($radio['appDownloadUrl']) ?>" target="_blank" rel="noopener noreferrer">Baixar app</a><?php endif; ?>
        </div>
    </section>
    <?php radio_links($radio); ?>
<?php else: ?>
    <h1><?= esc_html($route === '/' ? 'Do Brasil para o mundo' : $body_title) ?></h1>
    <?php if ($status === 404 || in_array($route, ['/', '/radios'], true)): ?>
        <p><?= esc_html($description) ?></p>
    <?php else: ?>
        <noscript><p>Ative o JavaScript para usar esta página.</p></noscript>
    <?php endif; ?>
    <?php if ($route === '/' || $route === '/radios'): radio_links(); endif; ?>
    <?php if ($route !== '/radios'): ?><p><a href="/radios/">Explorar rádios</a></p><?php endif; ?>
<?php endif; ?>
</main>
<footer class="site-footer"><div class="shell footer-inner">
    <a href="/"><img src="/a7-logo.png" width="100" height="69" alt="A7 Rádios On-Line"></a>
    <div><a href="/termos/">Termos</a><a href="/privacidade/">Privacidade</a></div>
    <a href="https://smartlocal.com.br" target="_blank" rel="noopener noreferrer">Desenvolvido por Douglas Borges - Smart Local</a>
</div></footer>
</div>
<?php if ($radio): ?><script type="application/json" id="a7-initial"><?= script_json($radio) ?></script><?php endif; ?>
<?php if (!empty($assets['file']) && $status === 200): ?><script type="module" src="/<?= esc_attr($assets['file']) ?>"></script><?php endif; ?>
</body></html>
    <?php
    exit;
}

function script_json(array $data): string {
    return wp_json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE);
}

function radio_links(?array $radio = null): void {
    global $wpdb;
    $table = table();
    $where = $radio ? $wpdb->prepare('AND category = %d AND id <> %d', $radio['category']['id'], $radio['id']) : '';
    $limit = $radio ? 4 : 10;
    $rows = $wpdb->get_results("SELECT slug, published_name FROM $table WHERE status = 'approved' $where ORDER BY approved_at DESC, id DESC LIMIT $limit", ARRAY_A);
    if (!$rows) return;
    echo '<section><h2>' . ($radio ? 'Rádios relacionadas' : 'Adicionadas recentemente') . '</h2><ul>';
    foreach ($rows as $row) {
        echo '<li><a href="' . esc_url(radio_url($row['slug'])) . '">' . esc_html($row['published_name']) . '</a></li>';
    }
    echo '</ul></section>';
}

function robots(): never {
    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: no-cache');
    echo "User-agent: *\nDisallow: /app/wp-admin/\nDisallow: /app/wp-login.php\n";
    if (index_enabled()) echo 'Sitemap: ' . origin() . "/sitemap.xml\n";
    exit;
}

function sitemap(int $page): never {
    global $wpdb;
    $table = table();
    $batch = 5000;
    $count = (int) $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'approved'");
    $pages = max(1, (int) ceil($count / $batch));
    if ($page > $pages) {
        status_header(404);
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'Sitemap indisponível.';
        exit;
    }
    header('Content-Type: application/xml; charset=UTF-8');
    if (!index_enabled()) no_store();
    else header('Cache-Control: no-cache');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    if (!$page && $pages > 1) {
        echo '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        for ($i = 1; $i <= $pages; ++$i) {
            echo '<sitemap><loc>' . esc_xml(origin() . '/sitemap-' . $i . '.xml') . '</loc></sitemap>';
        }
        echo '</sitemapindex>';
    } else {
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT slug, updated_at FROM $table WHERE status = 'approved' ORDER BY id LIMIT %d OFFSET %d",
            $batch, (max(1, $page) - 1) * $batch
        ), ARRAY_A);
        echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        foreach ($rows as $row) {
            echo '<url><loc>' . esc_xml(radio_url($row['slug'])) . '</loc><lastmod>' .
                esc_xml(published_time($row['updated_at'])) . '</lastmod></url>';
        }
        echo '</urlset>';
    }
    exit;
}
