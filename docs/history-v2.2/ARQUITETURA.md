# Arquitetura V2.2

A V1 é reaproveitada com fila SQLite e executor exclusivo. Migração 002 acrescenta missões, mensagens entre agentes, conversas, recebimentos e outbox. A inicialização migra Social para Growth, corrige pilares e preserva backup. VENDREX_COMPANY_CONTEXT.json entra nos quatro perfis.

Missions executa ferramentas reais: HTTP público limitado para Sales; geração de fonte, Git e Node para Builder; Pillow/FFmpeg/ffprobe para Growth; transcrição pública, mensagem interna e experimento versionado para Director. Não invoca modelos disfarçadamente. Cada resultado inclui manifestos, hashes e evidências. Falha em ferramenta deixa tarefa BLOCKED/FAILED em vez de gerar métrica fictícia.

ReplyEngine separa elegibilidade, agrupamento, geração, revalidação e envio. IDs únicos evitam duplicatas. Nova revisão cancela resposta antiga. Humano, opt-out e contato fora de escopo bloqueiam. Tentativa com efeito externo ambíguo exige reconciliação. Transporte real não existe por padrão; o transporte bloqueado nunca envia.

SupabaseStore é sincronização autenticada via JWT de usuário, com upsert por proprietário/entidade/id. Migração SQL habilita RLS e ownership; fila usa claim SECURITY INVOKER com SKIP LOCKED e índice de um trabalho RUNNING por usuário. A conexão não foi ativada por limitação de plano gratuito.

Control plane Vercel contém apenas apresentação, login Auth e leitura de registros autorizados. Não recebe chave service_role e não é executor permanente. O banco local continua funcional enquanto não existe projeto cloud dedicado.

Arquivos de mídia são servidos por rota limitada com HTTP Range; artefatos ativos não são executados como scripts do painel. Exportações de contato, bancos e credenciais ficam fora do GitHub público. A entrega privada contém provas e os arquivos produzidos.
