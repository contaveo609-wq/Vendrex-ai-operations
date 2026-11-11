# Painel V2.4 e backend Growth

O backend Growth está implantado no Supabase dedicado `ryxxpbxbjzijcuxgfgja`, região `sa-east-1`. Edge Function, Cron, fila, Vault, RLS e armazenamento foram configurados. O worker já respondeu HTTP 200 remotamente. Não há conta Meta conectada nem publicação real confirmada.

O painel está implementado em `public/`, com proxy seguro em `api/meta/[action].js`. Build: `npm run build`. O plano da conta Vercel autenticada é Hobby, conforme API oficial; seu uso é restrito a projetos pessoais não comerciais. **Não houve deploy comercial, upgrade, compra ou alteração no projeto CRM existente.**

Quando houver ambiente Vercel comercial já autorizado e elegível, use raiz `cloud/` e configure:

- `SUPABASE_URL=https://ryxxpbxbjzijcuxgfgja.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: chave pública do projeto, pelo mecanismo da plataforma.
- `PUBLIC_BASE_URL`: origem HTTPS canônica do painel, sem barra final.

Nenhuma chave service_role, token Meta ou segredo do app Meta deve ir à Vercel ou ao frontend. A função Supabase obtém credenciais sensíveis pelo runtime e pelo Vault. Configure os valores Meta conforme [guia](../docs/INTEGRACAO-META-V2.4.md).

O painel usa Supabase Auth. A sessão e a renovação ficam apenas na memória da página. Nenhum operador de produção foi criado sem identidade confirmada. Dados visíveis usam RLS; os endpoints Growth também conferem propriedade após validar o JWT no servidor. O callback OAuth usa estado único e cookie de vínculo ao navegador; o worker exige um segredo distinto.

Cron: uma chamada/minuto, aproximadamente 43.200 chamadas em 30 dias. Os horários de publicação são 12h e 18h America/Recife. Apenas conteúdo enfileirado é publicado. Pausa é por conta; uma operação já em envio pode concluir. A ativação exige publicação real previamente confirmada. O estado autenticado `/api/meta/status` depende de heartbeat recente e prova; `/api/meta/health` nunca anuncia operação por mera existência de código.

O executor Python dos demais bots continua local. Inferência local validada não é execução remota contínua nem autorização para expor a assinatura ChatGPT como backend público. Não há BSP, serviço pago de IA ou anúncio contratado.
