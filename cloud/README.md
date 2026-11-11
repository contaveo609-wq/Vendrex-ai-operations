# Control plane V2.2 — preparado, não conectado

Este código pode ser implantado na Vercel após autorização de produção e verificação de plano adequado para uso comercial. Não foi implantado como se estivesse conectado.

1. Crie um projeto Supabase dedicado elegível sem custo autorizado. A tentativa real nesta sessão foi bloqueada pelo limite de dois projetos gratuitos ativos. Não pause bancos de clientes para contornar esse limite.
2. Aplique a migração em `../supabase/migrations` ao projeto dedicado. Ela habilita RLS de propriedade em todas as tabelas e usa função SECURITY INVOKER para claim de fila. Nenhuma política usa user_metadata.
3. Configure um usuário no Supabase Auth. O painel faz login diretamente no endpoint oficial Auth e mantém a sessão somente em memória.
4. Variáveis do servidor Vercel: `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`. Nenhuma chave service_role é necessária no frontend ou na sincronização.
5. Build: `npm run build`. Publicação em Vercel exige plano compatível com uso comercial e autorização de produção. Projeto raiz da aplicação: `cloud/`.

Sincronização local: `SupabaseStore` em `vendrex/cloud_sync.py` envia registros reais com JWT do usuário. Configure `VENDREX_SUPABASE_URL`, `VENDREX_SUPABASE_PUBLISHABLE_KEY` e `VENDREX_SUPABASE_ACCESS_TOKEN` por mecanismo seguro do ambiente. Tokens não entram no ZIP. O módulo valida a sessão no servidor, faz upserts idempotentes e não imprime segredos.

A fila cloud é durável, mas não executa o modelo sozinha. Nenhum cron Vercel é anunciado como executor permanente do Codex. Um notebook desligado impede o executor local; um worker remoto oficialmente autenticado ainda precisa ser provisionado e validado. Não há garantia de reserva percentual de plano sem telemetria oficial.

Status: código IMPLEMENTED; conexão e testes RLS em servidor real BLOCKED pelo limite do plano gratuito. Os testes SQL e de acesso entre usuários só podem ser declarados TESTED após migração e autenticação no projeto dedicado.
