# A7 Rádios — deploy e rollback HostGator

**Não executar deploy sem aprovação.** Este arquivo é plano de implantação, não relato de ambiente testado. Inspiração: configuração observada no repositório Realmeidakits (`public/.htaccess`, documentação de autenticação/HostGator); não copiar diretamente regras específicas de pedidos/corridas.

## Ambiente confirmado

- HostGator; frontend: `https://a7radios.com.br/`.
- WordPress existente: `https://a7radios.com.br/app/`.
- Painel WP: `/app/wp-admin/`; REST: `/app/wp-json/` (testar permalinks).
- Frontend React/Vite gera arquivos estáticos `dist/`; plugin próprio WordPress instala-se em `/app/wp-content/plugins/a7-radios/` (caminho físico provável, inspecionar).
- **Não confirmar sem inspecionar:** caminho físico `public_html`, PHP e módulos Apache habilitados, `WP_HOME`, `WP_SITEURL`, `ABSPATH`, `.htaccess` raiz e `/app`, plugin de cache/segurança ativo, banco, domínio canônico e versão do SSL.

## Preparação

1. Inspecionar instalação sem alterar produção. Coletar somente configuração não secreta e detectar `.htaccess` raiz e `/app/.htaccess`. Em staging isolado com base própria, testar mesma estrutura `/` + `/app/`.
2. Backup testado do banco WP, `wp-config.php`, plugins, uploads, regras de rewrite e document root; registrar pontos de rollback, sem incorporar arquivos privados ao Git.
3. Definir `home`/`siteurl` de WP em `/app/` se já assim estiver; não reconfigurar sem necessidade. Confirmar acesso normal a wp-admin, login/recuperação, media e endpoints da API.
4. Preparar plugin próprio versionado, ZIP instalável, migrations idempotentes, rollback de código sem apagar banco. Instalar em staging, testar permissões e moderação.
5. `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (quando disponível), `pnpm build`. Verificar `dist`, manifesto se usado para render PHP, `.htaccess` gerado, OG, favicon, robots. Node não necessário em produção.

## Mapeamento Apache (não assumir que os exemplos são seguros para colagem direta)

- Ordem de rotas raiz: preservar segurança/regras preexistentes → excluir `/app/` de fallback React → servir arquivos reais → entregar `/radio/{slug}/` a handler WordPress para HTML SEO e status corretos → sitemap, se houver → fallback para **rotas React conhecidas** → 404.
- Cuidado com diretórios existentes, URLs de assets, canonical redirects do WP, `.well-known/`, `.htaccess` gerenciado pela HostGator e wordpress `/app/.htaccess`.
- O handler PHP deve preservar o `REQUEST_URI` original e fornecer `REQUEST_METHOD` GET/HEAD; evitar reescrita 302 externa para `/app/`.
- Não quebrar `/app/wp-admin/`, `/app/wp-json/`, uploads, `admin-ajax.php`, `wp-login.php`, `wp-cron.php` e recuperação de senha.
- Cache: assets com hash longa validade; HTML dinâmico condicionado à aprovação; SPA index curta; privados e nonce `no-store`. Header `X-Robots-Tag: noindex` em áreas privadas.

## Plano de validação antes de aprovar produção

- `/` e `/radios/` desktop/mobile, navegação profunda/refresco, rotas privadas, login/logout, two-account isolation e dashboard.
- `/radio/slug-aprovado/` HTTP 200, H1/texto na resposta HTML sem JavaScript, title, description, OG, canonical, JSON-LD factual, player; URL ausente `404`, não `200` com React shell.
- `/radio/slug-pendente/` não vazando dados; sitemap contendo apenas aprovadas e lastmod coerente; `robots.txt` permitindo páginas públicas mas bloqueando caminhos administrativos quando apropriado.
- `/app/wp-admin/`, `/app/wp-json/`, WP uploads, login/reset continuam atendidos; `POST`/`GET` com CSRF/permissões, sem CORS arbitrário.
- Player com stream real autorizado: apenas play após gesto, sem proxy, metadados nunca consultados antes de `playing`, fallback se não há metadados; testar parada/troca e HTTPS/CORS de exemplos reais somente com autorização.
- Mobile 320/375/768/1024/1440; Lighthouse/Core Web Vitals, console, acessibilidade e SEO sem JS. Testar revalidação/cache após aprovação, rejeição e remoção.

## Publicação e rollback

Publicar primeiro plugin homologado e assets hash; comparar/mesclar `.htaccess` raiz, preservar `/app/`; atualizar assets/index e páginas de SEO como conjunto; não acionar indexação enquanto QA, termos e privacidade estiverem pendentes. Após autorização de indexação, conferir sitemap, metatags, robots e painel Search Console (não presumir acesso). Em erro, restaurar **plugin + frontend + htaccess compatíveis** e, quando houver mudança de esquema não reversível, seguir plano de migração/backup; não sobrescrever banco com snapshot antigo sem reconciliar cadastros posteriores.

## Configuração entregue

O ZIP instalável contém a pasta `a7-radios/` do plugin. O build requer Node.js 22.12+ localmente. O servidor requer WordPress 6.6+, PHP 8.2+, MariaDB/MySQL com InnoDB, GD ou Imagick para imagens, HTTPS, permalinks REST e rewrite Apache. Habilite cURL e certificados locais válidos somente se usar importação remota. Compare esses requisitos com o ambiente real de hospedagem.

Configure no `wp-config.php`, antes de `wp-settings.php`, usando o caminho real da conta:

```php
define('A7R_ORIGIN', 'https://a7radios.com.br');
define('A7R_REGISTRATION', false);
define('A7R_REMOTE_IMAGES', false);
define('A7R_INDEX', false);
```

O plugin prepara `/app/wp-content/a7-radios-media/` com bloqueio Apache e usa a pasta se a regra da raiz e a proteção local estiverem presentes. Remova a constante antiga `A7R_MEDIA_DIR`. Siga o [guia de instalação](instalacao-hostgator.md) para validar o bloqueio. Inclua a pasta e o banco no backup e restaure-os juntos.

Ative o plugin em homologação, cadastre categorias no menu A7 Rádios e publique somente os documentos já validados em **Documentos aprovados**. Libere `A7R_REGISTRATION` quando o fluxo de contas estiver autorizado. Configure o transporte do `wp_mail` e valide entrega e recuperação por e-mail. Deixe `A7R_INDEX` desligado até autorização de indexação e ajuste a visibilidade WordPress para permitir indexação quando autorizado. Use banco, arquivos e ambiente separados para homologação.

Copie `dist/` com a pasta oculta `.vite/` e os assets com hash. Compare o `public/.htaccess` com as regras da raiz e mescle o bloco preservando as regras preexistentes e todo `/app/.htaccess`. O rewrite da raiz e das rotas conhecidas entrega o shell ou HTML pela mesma aplicação PHP, inclusive os cabeçalhos de páginas privadas. Rode `node scripts/test-local.mjs` em um ambiente descartável e reproduza o checklist de QA em homologação com a configuração de Apache/SSL/cache da HostGator. Verifique a identificação do IP em `REMOTE_ADDR` se houver CDN ou proxy confiável, configure a restauração de IP no servidor e evite confiar em cabeçalhos de cliente no plugin. Exclua sessões e áreas privadas do cache da CDN.

Em rollback, mantenha o diretório de imagens e o banco de versões. Mantenha os bloqueios Apache da pasta de imagens ao restaurar outras regras e arquivos da raiz.
