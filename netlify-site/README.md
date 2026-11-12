# Painel privado Netlify

O `netlify.toml` publica este painel no plano Free. A pasta `.netlify` está ignorada pelo Git. O login usa a identidade Netlify verificada em `context.user`, disponível em projetos privados; não cria usuários ou JWTs falsos no Supabase.

Configure no ambiente do servidor: `NETLIFY_OWNER_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SALES_DASHBOARD_SECRET`. O último deve coincidir com `sales_dashboard_secret` no Vault; o ID deve coincidir com `sales_netlify_owner_id`. O Free usa o escopo padrão de variáveis, pois a seleção granular exige plano pago. O código de build não lê nem incorpora variáveis; somente a Function consulta as credenciais em execução. Nunca publique esses valores em HTML ou no repositório. Mantenha o projeto **Private**, produção e previews.

O proxy só acessa status, personalidade, controles, contatos de teste, lista/histórico de conversas, gravação da chave Groq no Vault e leitura do pareamento do Sales. Confere proprietário, sessão, origem e método, e não expõe worker, webhook nem banco diretamente. O segredo tem escopo administrativo do Sales. A chave de serviço do Supabase não é fornecida à Netlify.

Build: `node netlify-site/build.mjs`. Verificação: `node --test tests/test_sales_netlify.mjs tests/test_sales_cloud.mjs`.

O painel permite editar personalidade e falas, salvar contato autorizado, pausar, ver mensagens reais, transferir para humano e salvar a chave do Groq Free sem exibi-la novamente. Builder, Growth e Director têm abas com resultados dos testes realizados e deixam explícito quando a execução contínua ainda não está disponível. A ativação geral continua bloqueada até a prova de conversa real e continuidade. Nenhuma prospecção é iniciada.

Em **Conectar WhatsApp**, o proprietário atualiza a conexão e escaneia manualmente o QR pelo celular. O gateway gera a imagem a partir do evento real do Baileys, cifra no Vault e restringe a leitura ao lease atual e ao prazo de validade. O site oculta a imagem vencida e acompanha o pareamento por até três minutos quando solicitado. Sem gateway ativo, mostra `HOST_REQUIRED` e não fabrica QR. Vincular o aparelho não ativa atendimento geral automaticamente.

Painel publicado: https://vendrex-operations-v24.netlify.app. O projeto permanece privado e requer a conta Netlify do proprietário.

Hospedar o painel não hospeda Baileys ou Ollama. Ambos exigem processo e armazenamento permanentes, fora das funções temporárias da Netlify. Nenhum plano, serviço ou modelo pago é contratado por este código.
