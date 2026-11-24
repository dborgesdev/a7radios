# Publicação A7 Rádios 2.2.0 na HostGator

O pacote `a7-radios-hostgator-2.2.0.zip` reúne o frontend estático e o plugin da mesma versão, as regras Apache, o trecho para o `wp-config.php` e as somas SHA-256. Extraia o pacote externo no computador. Na hospedagem, aplique os arquivos internos conforme a tabela.

| Arquivo | Destino |
| --- | --- |
| `a7-radios-wordpress-2.2.0.zip` | **WordPress → Plugins → Adicionar plugin → Enviar plugin**. Substitua o plugin atual pelo enviado. A pasta ativa deve continuar em `RAIZ/app/wp-content/plugins/a7-radios/`. |
| `a7-radios-frontend-2.2.0.zip` | Extraia o conteúdo na raiz do domínio `a7radios.com.br`, identificada em **cPanel → Domínios**. Esta raiz é chamada de `RAIZ` neste guia. |
| `apache-raiz.txt` | Mescle as regras no arquivo existente `RAIZ/.htaccess`. Preserve as diretivas do servidor e o arquivo `RAIZ/app/.htaccess`. |
| `wp-config-producao.txt` | Aplique as quatro definições no `wp-config.php` em uso pelo WordPress em `/app/`, antes do carregamento de `wp-settings.php`. Edite definições preexistentes para manter uma definição por constante. |

## Ordem de publicação

1. Em **cPanel → Domínios**, confira a raiz de `a7radios.com.br`. Faça backup do banco, do plugin atual, dos arquivos do frontend, do `wp-config.php`, dos dois `.htaccess` e de `RAIZ/app/wp-content/a7-radios-media/`. Guarde o backup fora da raiz pública. O plugin 2.2.0 preserva as tabelas e os registros existentes.
2. Envie os novos arquivos estáticos em `RAIZ/assets/` e as imagens do ZIP. Mantenha os assets com hash da versão anterior. Atualize o plugin pelo painel WordPress, preservando o mesmo diretório e a ativação. Troque `RAIZ/.vite/manifest.json` e `RAIZ/index.html` depois que os novos assets estiverem presentes. Ative **Mostrar arquivos ocultos** no Gerenciador de Arquivos para transferir `.vite/`.
3. Compare o trecho Apache com a configuração atual. A regra `RewriteRule ^app/wp-content/a7-radios-media(?:/|$) - [F,NC]` deve ser a primeira `RewriteRule` da raiz, fora de condicionais e sem `RewriteCond` imediatamente anterior. Preserve a delegação de `/app/` antes das rotas públicas. Inclua as rotas novas `/confirmar-email/` e `/painel/dados/` no encaminhamento ao PHP. Se houver arquivos físicos `robots.txt` ou `sitemap*.xml` que substituam as respostas dinâmicas, guarde-os no backup e retire as cópias conflitantes da raiz. O frontend é estático e dispensa Node.js na HostGator.
4. Aplique `A7R_ORIGIN=https://a7radios.com.br`, `A7R_REGISTRATION=true`, `A7R_REMOTE_IMAGES=false` e `A7R_INDEX=true` pelo trecho incluído. Em **Configurações → Leitura**, desmarque a opção de desencorajar mecanismos de busca. Se houver `WP_ENVIRONMENT_TYPE` definido explicitamente, use `production` nessa instalação. Preserve os endereços WordPress e Site em `https://a7radios.com.br/app`. Mantenha os documentos legais vigentes e exclua páginas privadas e sessão do cache forçado. Invalide o cache de HTML e `robots.txt` após a troca.
5. Confira `/`, `/radios/`, uma rádio aprovada e `/app/wp-admin/`. A Home, o catálogo canônico e as rádios aprovadas devem servir `index, follow`. `/robots.txt` deve anunciar `https://a7radios.com.br/sitemap.xml`. Uma rádio inexistente deve retornar 404. `/painel/` deve servir `noindex` e `Cache-Control: private, no-store`. Confirme que `/.vite/manifest.json` e a pasta privada de imagens retornam 403 em acesso direto. Verifique o cadastro e o recebimento do e-mail de recuperação com conta controlada.

A versão usa WordPress 6.6+, PHP 8.2+, GD ou Imagick, MySQL ou MariaDB com InnoDB, funções JSON e locks de sessão. A pasta privada de imagens mantém o `.htaccess` local com `Require all denied`, `Options -Indexes -ExecCGI` e `SetHandler none`. O endpoint de imagem pública entrega apenas o arquivo da versão aprovada.

## Rollback

Restaure em conjunto a pasta anterior do plugin, o manifesto e HTML anteriores, o `wp-config.php` e as regras Apache anteriores. Preserve o WordPress em `/app/`, as mídias protegidas e o banco ativo. Use o backup do banco apenas se precisar recuperar dados, reconciliando alterações posteriores à cópia.

## Atualização 2.2.0

O cadastro e a alteração de e-mail usam o SMTP configurado para `wp_mail()`. Novos usuários são inseridos no WordPress após confirmação em `/confirmar-email/`. Os links usam token de uso único com validade de 24 horas e fragmento de URL. O banco guarda hashes do token e da senha pendente. Os usuários existentes conservam conta, senha e permissões. Em `/painel/dados/`, o e-mail anterior permanece ativo até a confirmação do novo.

A exclusão definitiva exige administrador, nonce e confirmação. Exclui o registro da rádio, suas revisões e os pedidos de remoção vinculados. A tabela de opções precisa usar InnoDB para a exclusão transacional. Imagens com referências em outras rádios são mantidas. O registro mínimo de auditoria conserva o ID da rádio, a data e o ID do administrador. Se houver cache externo de HTML, invalide as rotas afetadas pela ação `a7r_radio_deleted`.

Mantenha `A7R_INDEX=true` e a configuração de cadastro existente. Use os dois ZIPs do release 2.2.0 e mescle o trecho Apache fornecido. Confirme a entrega de um e-mail de cadastro com conta controlada após a troca.

## Atualização 2.3.0

Substitua o plugin pelo ZIP `a7-radios-wordpress-2.3.0.zip` no painel WordPress e publique o conteúdo de `a7-radios-frontend-2.3.0.zip` na raiz do domínio. Envie primeiro os novos arquivos com hash em `assets/`. Em seguida, substitua `index.html` e `.vite/manifest.json`. O manifesto fica em uma pasta oculta. Mantenha os assets anteriores até confirmar a troca.

Esta atualização não exige edição do `.htaccess` nem do `wp-config.php`. Preserve as configurações atuais, o banco e os arquivos de mídia. Os links por plataforma são armazenados nos snapshots existentes. Quem já tinha um link único continua com ele. Revisões continuam sujeitas à aprovação antes da exposição pública.

A página PHP carrega o CSS no HTML inicial. Se o manifesto estiver indisponível, o PHP resolve os assets compilados a partir do `index.html`. Mantenha o HTML e sua versão correspondente do frontend juntos durante a troca.
