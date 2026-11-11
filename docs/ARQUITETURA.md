# Arquitetura

O processo Python serve o painel e mantém um worker determinístico. Ele verifica os horários e processa uma tarefa por vez. O Codex só é iniciado para tarefas marcadas como IA. Não há quatro processos de modelo nem chamadas ociosas.

`vendrex/db.py` aplica migrações transacionais, WAL, timeout de bloqueio, backups consistentes e logs estruturados em SQLite. A tabela flexível `records` armazena entidades de negócio com `entity`, `project_id` e JSON. Views nomeadas facilitam leitura de Leads, Clients, Deals, Payments, Projects, Requirements, ContentItems e Publications. Há tabelas relacionais próprias para agentes, tarefas, transições, eventos, instruções, treinamento, avaliações, uso, relatórios, auditoria e integrações.

`task_queue.py` valida transições e mantém fila persistente, dependências, prioridades com envelhecimento, histórico, tentativas e deduplicação. Um índice parcial impede duas tarefas RUNNING/CHECKPOINTING. A trava do sistema operacional impede dois processos executores na mesma pasta de dados. Um mutex adicional protege chamadas no processo atual. O relógio persistido usa UTC e os horários comerciais usam America/Recife.

`scheduler.py` calcula as rotinas 12h, 18h e 20h em America/Recife. No Windows sem base IANA, Recife usa UTC−03 fixo. Cada ciclo tem chave única por data e evento. Rotinas recentes podem ser recuperadas por até três horas; as demais são registradas como perdidas. Dias inteiros sem execução não geram tarefas em massa.

`service.py` implementa workflows e separa regras locais de IA. Venda validada gera cliente, contrato, projeto, requisitos, evento e tarefa Builder numa única transação. Pagamentos exigem evidência e não são presumidos a partir de contratos. Social produz roteiro, storyboard e SVG reais, com status de rascunho. Director consolida registros em oito seções Markdown.

`codex.py` usa app-server stdio oficial para catálogo e telemetria e `codex exec` para trabalhos. As respostas seguem schema JSON. `policy.py` aplica modelos, famílias, tetos de versão e esforço, saldo recente e reserva. Falhas de catálogo, saldo ou login bloqueiam a tarefa. Não existe fallback de API paga.

Cada tarefa tem pasta `runtime/workspaces/<task_id>`. Builder usa sandbox workspace-write nessa pasta; outros agentes usam read-only. Requisitos de projeto são filtrados por `project_id`. Os arquivos gerados ficam referenciados na tarefa e disponíveis para download local. Texto externo nunca controla configuração ou permissões.

`web.py` oferece HTTP loopback, valida Host/Origin e exige token CSRF para mutações. Não aceita shell ou comandos arbitrários via HTTP. O frontend usa JavaScript simples, sem bundler e sem chamadas externas.

Os quatro agentes são registros de perfis e playbooks. O quinto pode ser cadastrado no banco e receber tarefas sem reescrever a fila; sua interface, política e playbook precisam ser acrescentados antes de habilitar IA.
