# A7 Rádios — arquitetura e contratos (guia de implementação)

## Decisão central

Frontend SPA React/Vite estático em `/`, WordPress existente em `/app/`, plugin próprio `wordpress/plugins/a7-radios/` como API, CPT e moderação. Para SEO, a página da rádio **não pode depender de renderização JS**: recomenda-se despacho da rota `/radio/{slug}/` pelo Apache para `app/index.php`, com renderer PHP do plugin lendo os mesmos dados aprovados do WP e emitindo HTML inicial, metadados e asset Vite/React para aprimoramento interativo. Projetar compartilhamento visual com componentes React evitando duas implementações completas de interface; se modelo híbrido não entregar consistência, avaliar pré-renderização estática automática em cada aprovação/remoção. Testar host/rewrites reais. A home e o catálogo podem ser SPA mas devem ter metadados estáveis e links HTML adequados; avaliar HTML indexável para catálogo se SEO for objetivo.

## Configuração de roteamento — ordem, não bloco de produção pronto

1. Preservar `.htaccess` raiz existente, PHP WP e `/app/.htaccess`.
2. Bloquear o acesso direto a `/app/wp-content/a7-radios-media/` antes de delegar as demais rotas `/app/` ao WordPress.
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
- `GET /app/wp-json/a7-radios/v1/me/categories` → categorias para cadastro. `GET /app/wp-json/a7-radios/v1/me/submission-settings` → termo vigente e disponibilidade de importação de imagem. Ambos exigem sessão e nonce.
- Admin via wp-admin (actions/capabilities) e REST somente se comprovadamente útil; endpoint admin não é requisito para construir outro painel de administração.

**PublicRadio** recomendado: `{id,slug,name,category:{id,slug,name},country,region,description,streamUrl,websiteUrl|null,appDownloadUrl|null,image:{url,width,height,alt},approvedUpdatedAt,visitCount?}`. URLs diretas e metadados de imagem já resolvidos no WordPress; sem outra consulta `/media/`. Sanitizar descrição para HTML público, não retornar IDs de usuário, revisão, termos ou dados privados. Limitar `per_page` e assegurar ordem estável. Normalizar dados externos e manter `WP_Error`/HTTP status coerentes.

## Regras de moderação

- `pending` → aprovada/rejeitada; somente `approved` público.
- `approved` + proposta → snapshot publicado preservado, revisão `pending`; decisão por administrador; rejeição não altera público. Uma rádio pode ser aprovada e ter revisão pendente simultaneamente.
- Testar concorrência: revisão salva sobre versão-base específica, aprovação não sobrescreve edição administrativa posterior; registrar ação, timestamp e motivo, inclusive mudança de imagem e stream.
- Usuário não pode ler ou alterar rádio de terceiros nem por ID conhecido. Administração WP verificando `current_user_can()` e capabilities específicas.
- Termos de responsabilidade versionados; aceite grava versão, usuário, rádio, data/hora, conteúdo/hash da versão. Não ativar texto jurídico fictício em produção.

## Segurança dos recursos remotos

URL de stream será utilizada pelo navegador como fonte de áudio, não para `wp_remote_get()` do servidor. URLs de imagem remota requerem allowlist de protocolos, bloqueio de hosts/IPs privados e loopback inclusive após redirects/DNS, limites bytes/pixels/MIME/timeout, armazenar cópia segura antes de publicar; validar e converter os uploads com o WP Image Editor, armazenando-os no diretório protegido do plugin. URL de app somente HTTPS, bloquear `javascript:`, `data:`, `file:`, credenciais na URL e caracteres inválidos. Links externos `rel="noopener noreferrer"`.

## Player e metadados

Instância central de `Audio`, sem autoplay. Consultas de metadados somente **após evento `playing`** da rádio; usar dados já disponíveis no fluxo quando o navegador os expuser, sem assumir acesso a metadata ICY em `<audio>`; se endpoint associável ao streaming não puder ser descoberto de forma segura e compatível, desistir sem polling. 30s somente se fonte válida, abort + backoff + singleflight, parar em pause/stop/troca/desmontagem. Fallback contínuo logo e nome se metadados ausentes. Não executar polling em todos cards nem por abas independentes. Não consultar API externa de capa por padrão.

## SEO em ambiente dinâmico

Render PHP indexável deve compartilhar a fonte de dados WP e emitir `<!doctype html>` completo, encoding, title, meta description, robots, canonical, OG/Twitter, H1, imagem e descrição reais, breadcrumb e lista de links internos. Status apropriado para inexistente/rejeitada; não exibir info privada. Gerar sitemap apenas aprovadas e `lastmod` de mudança de versão publicada, sem indexar rotas pendentes. Testar como bot sem JS. Considerar cache de HTML público com invalidação explícita em aprovação/revisão, nunca compartilhar sessões. `RadioStation` JSON-LD somente com dados reais verificados e schema válido; não presumir que o Google ofereça rich result.

## Testes de segurança mínimos

Dois proprietários A/B e um admin em base de homologação; acesso por IDs cruzados retorna 403/404; submissão, edição e exclusão de outros usuários não autorizadas; página pública permanece igual até aprovação; revisão rejeitada não altera dados; atualização em paralelo resolve conflito; uploads maliciosos e URL interna bloqueados; CSRF sem nonce rejeitado; alterações de categoria e status invalidam cache e sitemap; endpoint privado sem cache; perfis proprietários não entram em wp-admin administrativo; robots não substitui autorização. Testes não destrutivos com dados fictícios somente em staging.

## Implementação V1

- O frontend compilado e o manifesto Vite ficam na raiz Apache. O handler do plugin lê o URI original no início de `parse_request`, antes da escolha de template/canonical do WordPress. A página individual apresenta a versão publicada, player HTML nativo e links relacionados sem JS. Com JavaScript, o React monta sobre o mesmo conteúdo e usa o payload inicial enquanto revalida o detalhe. O catálogo, a home, o sitemap e a API leem a mesma fonte de dados.
- O catálogo usa uma tabela InnoDB própria no banco do WordPress, com índices por situação, titular e categoria. O tipo privado `a7_radio` fornece o contexto da taxonomia nativa, enquanto identidades, versões e snapshots das rádios ficam na tabela. A escrita condicional na sequência e na versão atualiza o snapshot publicado, a revisão com aceite, o histórico e suas projeções em uma única operação. Mudanças em categorias cadastráveis entram nas respectivas páginas publicadas quando uma nova versão da rádio é aprovada.
- Usuários, cookies, sessão e redefinição de senha são nativos do WordPress. O bootstrap e os formulários de sessão usam `admin-ajax.php?action=a7r_{session,login,register,recover,reset,logout}`. As ações POST de sessão verificam origem exata e token de formulário em cookie HttpOnly. Os endpoints privados REST verificam cookie, nonce WP, capability e titularidade e enviam `no-store`. As decisões administrativas passam por `admin-post.php` com nonce por rádio e capability.
- Upload aceita PNG, JPEG e WebP até 5 MiB, 64 a 4096 px por lado e no máximo 12 megapixels. O WP Image Editor recorta no centro e grava PNG quadrado 512×512 em `/app/wp-content/a7-radios-media/`. O Apache bloqueia a pasta com uma regra na raiz e um `.htaccess` local. As importações por URL usam arquivos temporários nessa mesma pasta. As URLs públicas servem apenas a imagem da versão aprovada atual. A opção de importação HTTPS é desativada por padrão. Quando habilitada, exige cURL com TLS, DNS IPv4 público fixado na conexão, porta 443, rejeição de redirecionamentos e limites de transferência.
- Visitas são aproximações de navegação na página individual com JS. Uma visita por IP e rádio em janelas fixas de 30 minutos, com limite global por IP. O controle armazena chaves HMAC temporárias e não usa cookies de rastreamento. WP-Cron elimina os buckets expirados.
- Um elemento de áudio reproduz a URL aprovada diretamente. Quando o navegador expõe dados em trilha nativa de metadados, o player começa a escutá-la após `playing` e cancela em pausa, troca, erro ou encerramento. O logo e o nome são o fallback. Metadados ficam restritos às trilhas que o navegador expõe. A reprodução com streams reais e disponibilidade de metadados dependem de validação com emissoras cadastradas.

## Contratos V2

- `city` é um campo opcional do snapshot de revisão e publicação. O SQL usa a cidade do snapshot publicado na busca. O banco precisa suportar `JSON_EXTRACT` e `JSON_UNQUOTE`.
- `POST /me/category-suggestions` exige sessão, nonce e origem válida. O nome normalizado é reservado uma única vez para análise e a publicação ocorre por meio da taxonomia nativa após aprovação administrativa.
- `POST /radios/{id}/removal` verifica origem, disponibilidade pública da rádio, limites de frequência e conteúdo do pedido. As filas ficam em opções com autoload desativado. Após decisão, os dados de identificação, contato e fundamentação do requerente são retirados do registro ativo. A decisão conserva o rádio associado, data, moderador e justificativa. Backups seguem a política de retenção da instalação.
- A imagem de revisão no painel é obtida pelo frontend com nonce REST em cabeçalho. A API confere titularidade, snapshot atual e asset, e serve a imagem com `no-store`.
- O endpoint de visita continua em HTTP 204 e devolve a contagem no cabeçalho `X-A7-Visit-Count`. O controle de deduplicação da V1 permanece.
- O editor de documentos usa um subconjunto de Markdown com títulos, negrito, itálico, listas, código inline e links HTTP(S). PHP compartilha o renderizador entre prévia administrativa, API e HTML inicial. Textos legados preservam a apresentação em texto simples. A publicação exige confirmação e uma base vigente e guarda uma nova versão automática com histórico imutável. O banco precisa permitir locks de sessão `GET_LOCK` para serializar publicações e decisões.

## Refinamento Broadcast Premium

- A paginação usa o mesmo limite de 24 em todas as larguras. Aumentar ou diminuir colunas não altera offsets.
- O player integrado observa sua própria visibilidade abaixo do cabeçalho fixo e usa o estado do provedor de áudio. A barra flutuante é desmontada enquanto o player integrado está visível.
- A associação de sugestão de categoria é armazenada na proposta de rádio, validada contra o titular, e resolvida antes da publicação. Um lock por sugestão coordena a decisão na fila geral e na revisão individual. A categoria é administrada separadamente do snapshot. Uma corrida na versão da rádio pode exigir nova aprovação da rádio depois de a resolução da categoria já ter sido registrada.
- A edição administrativa reutiliza a validação de campos e o processamento de imagens. Campos, versão publicada, histórico e projeções de busca mudam com a mesma operação condicional de sequência e versão. Ações em lote mantêm resultado individual e podem terminar parcialmente.
- O pedido autenticado é identificado pela conta e rádio, com chave única no banco. O formulário usa nonce REST. O endpoint privado verifica titularidade e entrega o status sem cache. A fila conserva a decisão conforme a política já definida para pedidos de remoção.

## Contas confirmadas e exclusão definitiva

O registro pendente fica em opções sem autoload e não possui sessão nem conta WordPress. Um lock por endereço coordena o cadastro, o reenvio e a confirmação. Confirmações de alteração também são serializadas por conta. A autenticação continua nativa. O fragmento do link é enviado ao backend em POST de mesma origem. O cadastro e o reenvio possuem limites por IP e por endereço.

A exclusão serializa o acesso à estação e aos pedidos de remoção vinculados. O catálogo, o sitemap e as páginas consultam os registros publicados atuais. Para extensões de cache, o hook `a7r_radio_deleted` informa ID e slug depois do commit.

O endpoint de estatísticas utilizado no repositório Geração Vinil FM devolveu HTTP 200 sem oferecer CORS à origem do portal. O repositório A7 Jovem Guarda FM não consulta metadados. O player do portal usa as trilhas nativas disponíveis após `playing` e cancela os listeners ao pausar ou trocar de rádio. Ambos os modos exibem a mesma informação, com a identidade da rádio como fallback.
