# A7 Rádios On-Line

Portal React/Vite na raiz do domínio e plugin PHP para o WordPress existente em `/app/`. O PHP entrega HTML e status HTTP das rádios aprovadas a partir do mesmo catálogo usado pela API. O React assume navegação, formulários e player no navegador.

## Preview visual

Requer Node.js 22.12+ e pnpm.

```powershell
pnpm install --frozen-lockfile
$env:VITE_A7_DEMO = '1'
pnpm dev
```

Abra [o preview Vite](http://127.0.0.1:5173/). O modo DEMO mostra dados identificados como sintéticos e serve para avaliação visual. O painel e a moderação integram o WordPress no ambiente descrito abaixo. O build de produção exclui o catálogo DEMO.

## WordPress local com a topologia da produção

1. Use PHP 8.2+ com `mysqli`, `mbstring` e GD ou Imagick, MariaDB/MySQL com InnoDB e WordPress 6.6+. Crie um banco descartável e instale os arquivos WordPress em `.local/www/app/`.
2. Copie `wordpress/plugins/a7-radios` para `.local/www/app/wp-content/plugins/`. Configure o banco e as chaves WordPress em `.local/www/app/wp-config.php`. Inclua as constantes abaixo antes de carregar `wp-settings.php`.

```php
define('WP_ENVIRONMENT_TYPE', 'local');
define('A7R_ORIGIN', 'http://127.0.0.1:8173');
define('WP_HOME', A7R_ORIGIN . '/app');
define('WP_SITEURL', WP_HOME);
define('A7R_REGISTRATION', true);
```

3. Na raiz do projeto, execute os comandos abaixo. O instalador local cria uma categoria e um termo DEMO. As credenciais descartáveis ficam em `.local/local-admin.json` e as mensagens de recuperação de contas `@example.test` em `.local/mail/`.

```powershell
pnpm install --frozen-lockfile
pnpm build
Copy-Item -Force -Recurse dist/* .local/www/
Copy-Item -Force dist/.htaccess .local/www/.htaccess
php scripts/install-local.php .local/www/app
php -S 127.0.0.1:8173 -t .local/www scripts/local-router.php
```

Abra [o portal integrado](http://127.0.0.1:8173/) ou [o painel WordPress local](http://127.0.0.1:8173/app/wp-admin/). Para usar Apache e exercitar os rewrites, sirva `.local/www/` como document root, habilite `mod_rewrite` e `mod_headers`, permita o `.htaccess` e configure os permalinks de WordPress em `/app/`. O servidor PHP embutido é uma alternativa de desenvolvimento.

## Verificações

```powershell
pnpm typecheck
pnpm lint
pnpm build
node scripts/test-local.mjs
```

O teste HTTP cria dois proprietários DEMO no banco descartável e exercita login, recuperação, nonce, isolamento, envio, revisão, aprovação, rejeição, arquivamento e SEO sem JavaScript. Por padrão, arquiva a rádio de teste ao final. Para conservar uma rádio DEMO aprovada no banco local, execute com `$env:A7_KEEP_DEMO = '1'`. Se mudar a porta, ajuste `A7R_ORIGIN` e `$env:A7_TEST_ORIGIN` para o mesmo endereço.

Consulte [arquitetura](docs/architecture.md) e [HostGator, publicação e rollback](docs/deployment.md).
