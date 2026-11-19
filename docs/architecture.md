# A7 Rádios — arquitetura e contratos (guia de implementação)

## Decisão central

Frontend SPA React/Vite estático em `/`, WordPress existente em `/app/`, plugin próprio `wordpress/plugins/a7-radios/` como API, CPT e moderação. Para SEO, a página da rádio **não pode depender de renderização JS**: recomenda-se despacho da rota `/radio/{slug}/` pelo Apache para `app/index.php`, com renderer PHP do plugin lendo os mesmos dados aprovados do WP e emitindo HTML inicial, metadados e asset Vite/React para aprimoramento interativo. Projetar compartilhamento visual com componentes React evitando duas implementações completas de interface; se modelo híbrido não entregar consistência, avaliar pré-renderização estática automática em cada aprovação/remoção. Testar host/rewrites reais. A home e o catálogo podem ser SPA mas devem ter metadados estáveis e links HTML adequados; avaliar HTML indexável para catálogo se SEO for objetivo.

## Configuração de roteamento — ordem, não bloco de produção pronto

1. Preservar `.htaccess` raiz existente, PHP WP e `/app/.htaccess`.
2. Interceptar zero requisições de `/app/`, REST, admin, uploads ou arquivos existentes.
3. Rota `/radio/{slug}/`: validar slug canônico e redirecionar internamente para handler WP, sem exposição de path alternativo ou loops. Retornar 200/301/404/410 de fato. Se o WP resolver `/radio/{slug}` fora de sua home `/app/`, tratar query vars e `request`/template route via plugin; validar com URL original, `REQUEST_URI`, canônico e SSL.
4. `sitemap.xml` ou `sitemap-radios.xml`: handler WP ou geração estática, incluindo somente aprovadas; não colidir com `/app/wp-sitemap.xml`.
5. Arquivos estáticos do build; depois fallback somente para rotas SPA conhecidas. Para caminhos desconhecidos, 404 real, não index shell.
6. Raiz `/` → index frontend; para rotas privadas, noindex e no-store, inclusive resposta inicial. Cuidado com cabeçalhos de `index.html` reaproveitado em várias rotas.

Regras Apache precisam ser testadas, não coladas cegamente do Realmeidakits. Arquivo `public/.htaccess` sugerido pelo Codex só deve ser implantado **após comparação com o atual**.

## Contrato sugerido (versionado)

**Públicos, GET:**
- `GET /app/wp-json/a7-radios/v1/radios?page=1&per_page=20&search=&category=` → `{items:[PublicRadio], page, perPage, total, totalPages}` com apenas aprovadas.
- `GET /app/wp-json/a7-radios/v1/radios/{slug}` → `PublicRadio` ou 404.
- `GET /app/wp-json/a7-radios/v1/categories` → `[{id, slug, name, count}]`, apenas categorias relevantes para aprovadas se aplicado.
- `GET /app/wp-json/a7-radios/v1/discovery` → `{latest: PublicRadio[], suggested: PublicRadio[]}`; últimos 10, sugestões aprovadas sem fingir recomendação personalizada.
- `POST /app/wp-json/a7-radios/v1/radios/{id}/visit` → contagem de visita de página, sem repassar dados pessoais; validar antiabuso. Não contar play como visita.

**Sessão e privados (contrato concreto a validar contra WP):**
- `GET /app/wp-admin/admin-ajax.php?action=a7r_session` → `{authenticated:boolean, user?:{id,name,role}, nonce?}`; origem/headers protegidos, no-store, sem vazar dados para anônimos.
- Login, cadastro, recuperação, logout: **usar mecanismos seguros WP nativos e experiência visual React**, documentando endpoints exatos e processo de nonce/CSRF; não expor senhas por APIs improvisadas. Considerar páginas formulários WP com customização limitada se reduz risco.
- `GET /app/wp-json/a7-radios/v1/me/radios` → lista privada apenas do usuário.
- `POST /app/wp-json/a7-radios/v1/me/radios` → novo cadastro `pending`.
- `GET /app/wp-json/a7-radios/v1/me/radios/{id}` → snapshot próprio com histórico relevante.
- `POST /app/wp-json/a7-radios/v1/me/radios/{id}/revisions` → submissão de **snapshot/diff pendente**, nunca publicação imediata.
- `GET /app/wp-json/a7-radios/v1/me/dashboard` → contagens próprias.
- Admin via wp-admin (actions/capabilities) e REST somente se comprovadamente útil; endpoint admin não é requisito para construir outro painel de administração.

**PublicRadio** recomendado: `{id,slug,name,category:{id,slug,name},country,region,description,streamUrl,websiteUrl|null,appDownloadUrl|null,image:{url,width,height,alt},approvedUpdatedAt,visitCount?}`. URLs diretas e metadados de imagem já resolvidos no WordPress; sem outra consulta `/media/`. Sanitizar descrição para HTML público, não retornar IDs de usuário, revisão, termos ou dados privados. Limitar `per_page` e assegurar ordem estável. Normalizar dados externos e manter `WP_Error`/HTTP status coerentes.

## Regras de moderação

- `pending` → aprovada/rejeitada; somente `approved` público.
- `approved` + proposta → snapshot publicado preservado, revisão `pending`; decisão por administrador; rejeição não altera público. Uma rádio pode ser aprovada e ter revisão pendente simultaneamente.
- Testar concorrência: revisão salva sobre versão-base específica, aprovação não sobrescreve edição administrativa posterior; registrar ação, timestamp e motivo, inclusive mudança de imagem e stream.
- Usuário não pode ler ou alterar rádio de terceiros nem por ID conhecido. Administração WP verificando `current_user_can()` e capabilities específicas.
- Termos de responsabilidade versionados; aceite grava versão, usuário, rádio, data/hora, conteúdo/hash da versão. Não ativar texto jurídico fictício em produção.

## Segurança dos recursos remotos

URL de stream será utilizada pelo navegador como fonte de áudio, não para `wp_remote_get()` do servidor. URLs de imagem remota requerem allowlist de protocolos, bloqueio de hosts/IPs privados e loopback inclusive após redirects/DNS, limites bytes/pixels/MIME/timeout, armazenar cópia segura antes de publicar; preferir `media_handle_upload()` para upload com validação WP. URL de app somente HTTPS, bloquear `javascript:`, `data:`, `file:`, credenciais na URL e caracteres inválidos. Links externos `rel="noopener noreferrer"`.

## Player e metadados

Instância central de `Audio`, sem autoplay. Consultas de metadados somente **após evento `playing`** da rádio; usar dados já disponíveis no fluxo quando o navegador os expuser, sem assumir acesso a metadata ICY em `<audio>`; se endpoint associável ao streaming não puder ser descoberto de forma segura e compatível, desistir sem polling. 30s somente se fonte válida, abort + backoff + singleflight, parar em pause/stop/troca/desmontagem. Fallback contínuo logo e nome se metadados ausentes. Não executar polling em todos cards nem por abas independentes. Não consultar API externa de capa por padrão.

## SEO em ambiente dinâmico

Render PHP indexável deve compartilhar a fonte de dados WP e emitir `<!doctype html>` completo, encoding, title, meta description, robots, canonical, OG/Twitter, H1, imagem e descrição reais, breadcrumb e lista de links internos. Status apropriado para inexistente/rejeitada; não exibir info privada. Gerar sitemap apenas aprovadas e `lastmod` de mudança de versão publicada, sem indexar rotas pendentes. Testar como bot sem JS. Considerar cache de HTML público com invalidação explícita em aprovação/revisão, nunca compartilhar sessões. `RadioStation` JSON-LD somente com dados reais verificados e schema válido; não presumir que o Google ofereça rich result.

## Testes de segurança mínimos

Dois proprietários A/B e um admin em base de homologação; acesso por IDs cruzados retorna 403/404; submissão, edição e exclusão de outros usuários não autorizadas; página pública permanece igual até aprovação; revisão rejeitada não altera dados; atualização em paralelo resolve conflito; uploads maliciosos e URL interna bloqueados; CSRF sem nonce rejeitado; alterações de categoria e status invalidam cache e sitemap; endpoint privado sem cache; perfis proprietários não entram em wp-admin administrativo; robots não substitui autorização. Testes não destrutivos com dados fictícios somente em staging.
