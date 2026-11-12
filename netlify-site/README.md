# Painel privado Netlify

O `netlify.toml` publica este painel no plano Free. A pasta `.netlify` está ignorada pelo Git. O login usa a identidade Netlify verificada em `context.user`, disponível em projetos privados; não cria usuários ou JWTs falsos no Supabase.

Configure no ambiente do servidor: `NETLIFY_OWNER_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SALES_DASHBOARD_SECRET`. O último deve coincidir com `sales_dashboard_secret` no Vault; o ID deve coincidir com `sales_netlify_owner_id`. O Free usa o escopo padrão de variáveis, pois a seleção granular exige plano pago. O código de build não lê nem incorpora variáveis; somente a Function consulta as credenciais em execução. Nunca publique esses valores em HTML ou no repositório. Mantenha o projeto **Private**, produção e previews.

O proxy só acessa os cinco endpoints administrativos permitidos do Sales, confere proprietário, sessão, origem e método, e não expõe worker, webhook nem banco diretamente. O segredo tem escopo administrativo do Sales. A chave de serviço do Supabase não é fornecida à Netlify.

Build: `node netlify-site/build.mjs`. Verificação: `node --test tests/test_sales_netlify.mjs tests/test_sales_cloud.mjs`.

O painel permite editar personalidade e falas, salvar contato autorizado e pausar. A ativação geral continua bloqueada até a prova de conversa real e continuidade. Nenhuma prospecção é iniciada.

Hospedar o painel não hospeda Baileys ou Ollama. Ambos exigem processo e armazenamento permanentes, fora das funções temporárias da Netlify. Nenhum plano, serviço ou modelo pago é contratado por este código.
