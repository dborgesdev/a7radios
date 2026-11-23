# Instalação A7 Rádios na HostGator

Use a raiz atribuída a `a7radios.com.br` em **cPanel → Domínios**. Neste guia, `RAIZ` representa esse diretório, geralmente `public_html`. O WordPress existente fica em `RAIZ/app/`. O servidor precisa de WordPress 6.6+, PHP 8.2+, MySQL ou MariaDB com InnoDB, GD ou Imagick com suporte aos formatos de imagem aceitos, HTTPS e Apache com `mod_rewrite` habilitado. `mod_headers` é usado para o cache dos assets.

1. Faça backup do banco, de `RAIZ/.htaccess`, dos arquivos atuais da raiz e do `wp-config.php`. Ative **Mostrar arquivos ocultos** no Gerenciador de Arquivos. Confirme que os endereços WordPress e Site do WordPress atual apontam para `https://a7radios.com.br/app` e que `/app/wp-json/` responde.
2. No `wp-config.php` em uso, antes de carregar `wp-settings.php`, configure as constantes abaixo. Remova uma eventual definição antiga de `A7R_MEDIA_DIR`. O plugin usa `RAIZ/app/wp-content/a7-radios-media/` e cria a pasta e seu `.htaccess` ao ativar ou no primeiro envio, desde que a regra da raiz já esteja instalada e o PHP possa gravar em `wp-content`.

   ```php
   define('A7R_ORIGIN', 'https://a7radios.com.br');
   define('A7R_REGISTRATION', true);
   define('A7R_REMOTE_IMAGES', false);
   define('A7R_INDEX', false);
   ```

   O plugin detecta a raiz pelo document root do Apache. Se for necessário apontá-la explicitamente, acrescente `define('A7R_FRONTEND_DIR', '/home/CONTA_CPANEL/public_html');` com o caminho real. Ajuste `upload_max_filesize` para pelo menos 6 MB e `post_max_size` para pelo menos 8 MB no PHP. A alternativa de imagem por URL fica disponível se você ativar `A7R_REMOTE_IMAGES` e o PHP tiver cURL com TLS funcional.

3. Em **WordPress → Plugins → Adicionar plugin → Enviar plugin**, instale `a7-radios-wordpress-v2.zip` e ative **A7 Rádios On-Line**. A pasta final será `RAIZ/app/wp-content/plugins/a7-radios/`.
4. Extraia `a7-radios-frontend-v2.zip` diretamente em `RAIZ/`, ou copie o conteúdo de `dist/` para lá. O resultado deve incluir `RAIZ/index.html`, `RAIZ/assets/`, `RAIZ/.vite/manifest.json`, `RAIZ/a7-logo.webp`, `RAIZ/broadcast-studio.webp`, `RAIZ/a7-icon.png` e `RAIZ/a7-og.jpg`. Mantenha os assets com hash da versão anterior até concluir a troca do manifesto e a validação.
5. Mescle `dist/.htaccess` em `RAIZ/.htaccess`. O ZIP do frontend deixa esse arquivo separado para evitar troca acidental das regras do servidor:
   - Preserve as diretivas do cPanel, do PHP e de segurança. Com `RewriteEngine On` habilitado, ponha `RewriteRule ^app/wp-content/a7-radios-media(?:/|$) - [F,NC]` como primeira `RewriteRule` da raiz, fora de blocos condicionais e sem `RewriteCond` imediatamente anterior. Em seguida preserve as regras de domínio/HTTPS e instale a delegação de `/app/` antes dos fallbacks da raiz. Preserve `RAIZ/app/.htaccess`.
   - Se a raiz já tiver arquivos físicos `robots.txt` ou `sitemap*.xml`, mova as versões antigas para o backup após revisar as diretivas que precisam ser mantidas. Arquivos físicos com esses nomes têm precedência sobre a resposta dinâmica.
   - Exclua HTML dinâmico, Ajax de sessão e API A7 de regras de cache forçado. Confira a sessão via HTTPS, inclusive se a hospedagem estiver atrás de CDN. O arquivo `/.vite/manifest.json` deve retornar 403 externamente, enquanto o PHP lê a cópia local.
6. Em **A7 Rádios → Categorias**, cadastre as categorias. Em **Documentos aprovados**, publique o Termo de Responsabilidade e a Política de Privacidade após validação. O termo vigente libera o envio de rádios. Confirme a entrega de e-mail de recuperação pelo WordPress e mantenha `A7R_INDEX` como `false` até autorizar a indexação.

## Proteção da pasta de imagens

Antes de enviar imagens reais, confirme que o PHP pode criar e escrever em `RAIZ/app/wp-content/a7-radios-media/`. Se precisar criar a pasta e o arquivo manualmente pelo cPanel, salve o seguinte conteúdo em `RAIZ/app/wp-content/a7-radios-media/.htaccess`, sem BOM, e mantenha a pasta fora de aliases públicos.

```apache
Require all denied
Options -Indexes -ExecCGI
SetHandler none
```

Envie um arquivo de texto inofensivo de teste nessa pasta e confirme HTTP 403 no endereço direto dele e da pasta. Remova o arquivo após a conferência. Exclua esse caminho e os endpoints de imagens A7 de regras de cache forçado ou de entrega estática da CDN. Na migração de uma instalação anterior, depois de validar o bloqueio, copie apenas as mídias PNG geradas pelo plugin para a nova pasta, preservando os nomes. Os identificadores e as URLs públicas da API continuam válidos. Faça backup da pasta junto com o banco.

## Verificação após instalar

- Abra `/`, `/radios/`, `/login/`, `/app/wp-admin/` e `/app/wp-json/`. Confirme que `/radio/inexistente/` retorna HTTP 404.
- Cadastre uma rádio com um stream HTTPS autorizado. Confira que ela só aparece no catálogo e no sitemap após aprovação. Em seguida, envie uma revisão e confira que a página mostra a versão anterior até aprová-la.
- Confira HTML, H1 e canonical com JavaScript desligado e teste streaming no navegador. Enquanto a indexação estiver desativada, a página aprovada deve servir `noindex` e `/robots.txt` deve omitir o anúncio do sitemap A7.

Em caso de falha, restaure os arquivos anteriores da raiz e desative o plugin, mantendo o bloqueio da pasta no `.htaccess` da raiz e dentro da própria pasta. Preserve o banco e o diretório de imagens para conservar cadastros e históricos. Veja [o plano de publicação e rollback](deployment.md).
