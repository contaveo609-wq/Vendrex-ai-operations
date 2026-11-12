# Painel V2.4, Sales e Growth

O backend Growth está implantado no Supabase dedicado `ryxxpbxbjzijcuxgfgja`, região `sa-east-1`. Edge Function, Cron, fila, Vault, RLS e armazenamento foram configurados. O worker já respondeu HTTP 200 remotamente. Não há conta Meta conectada nem publicação real confirmada.

O painel está implementado em `public/`, com proxies seguros em `api/meta/[action].js` e `api/sales/[action].js`. A aba **Sales e personalidade** permite editar personalidade, instruções, abertura, permissão e proposta, além dos controles de teste e pausa. A gravação passa pelo JWT do usuário e pelo cadastro de operadores no Supabase. Build: `npm run build`.

O plano da conta Vercel autenticada foi novamente verificado em 12/11/2026 e continua Hobby, restrito a uso pessoal não comercial. A definição considera finalidade financeira, mesmo com um único usuário. **Não houve deploy comercial, upgrade, compra ou alteração no projeto CRM existente.** [Regra oficial](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage).

Publicar o painel não mantém os executores ativos. Containers Vercel escalam para zero após cinco minutos sem tráfego em produção; não foram configurados loops ou pings para contornar isso. O gateway Baileys e a inferência própria exigem um servidor permanente. [Ciclo de vida oficial](https://vercel.com/docs/functions/runtimes/container#scale-in-behavior).

Quando houver ambiente Vercel comercial já autorizado e elegível, use raiz `cloud/` e configure:

- `SUPABASE_URL=https://ryxxpbxbjzijcuxgfgja.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: chave pública do projeto, pelo mecanismo da plataforma.
- `PUBLIC_BASE_URL`: origem HTTPS canônica do painel, sem barra final.

Nenhuma chave service_role, token Meta ou segredo do app Meta deve ir à Vercel ou ao frontend. A função Supabase obtém credenciais sensíveis pelo runtime e pelo Vault. Configure os valores Meta conforme [guia](../docs/INTEGRACAO-META-V2.4.md).

O painel usa Supabase Auth. A sessão e a renovação ficam apenas na memória da página. Nenhum operador de produção foi criado sem identidade confirmada. Dados visíveis usam RLS; os endpoints Growth também conferem propriedade após validar o JWT no servidor. O callback OAuth usa estado único e cookie de vínculo ao navegador; o worker exige um segredo distinto.

Cron: uma chamada/minuto, aproximadamente 43.200 chamadas em 30 dias. Os horários de publicação são 12h e 18h America/Recife. Apenas conteúdo enfileirado é publicado. Pausa é por conta; uma operação já em envio pode concluir. A ativação exige publicação real previamente confirmada. O estado autenticado `/api/meta/status` depende de heartbeat recente e prova; `/api/meta/health` nunca anuncia operação por mera existência de código.

O executor Python dos demais bots continua local. Inferência local validada não é execução remota contínua nem autorização para expor a assinatura ChatGPT como backend público. Não há BSP, serviço pago de IA ou anúncio contratado.
