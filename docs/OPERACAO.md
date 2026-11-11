# Manual de operação

## Primeiro uso

Extraia o ZIP antes de executar. Abra `Iniciar.cmd` ou rode `py -3 .\run.py serve --open`. Não abra apenas `dashboard/index.html`: ele precisa do backend local. Use `http://127.0.0.1:8766`. Base real inicia vazia e pausada. A porta pode ser alterada com `--port` e os dados com `--data C:\Vendrex\dados`.

## Sales

Cadastre empresa, segmento, cidade, fonte, contato comercial e necessidade. Diferencie hipótese de fato. O botão Qualificar adiciona rotina local à fila. A pontuação considera fonte, dor, adequação de segmento, contato e interesse humano confirmado; não representa probabilidade comprovada de venda. Descadastro zera a prioridade.

Pilares e oferta de referência são editáveis em Configurações. O valor R$597,90 é referência e não promessa geral. Tarefas SALES_DRAFT geram proposta em Markdown, sem enviar mensagens.

Confirme uma venda somente após validar evidência, escopo, valor e prazo. Um identificador por formulário evita repetição do mesmo evento. O Builder receberá briefing. Registre recebimentos separadamente com referência de comprovante. A validação da autenticidade do comprovante continua humana.

## Builder

Vendas e trabalhos autorizados geram pastas isoladas. BUILD_BRIEF cria o briefing e inicializa Git. Para construir software com IA, crie BUILD_PROJECT, selecione o projeto e informe o escopo. Configure primeiro Codex, modelo e saldo. O resultado de uma inferência é rascunho para revisão, não certificado de conclusão do produto. Verifique build e testes no relatório da tarefa. Cada novo trabalho usa pasta própria; correções devem receber os arquivos de referência necessários por meios autorizados. Não há deploy automático.

## Social

Importe pesquisa com fonte e trechos relevantes. O material fica marcado como dado externo não confiável. As rotinas das 12h e 18h preparam pacote editorial usando templates locais; sem pesquisa, isso é explicitado. Baixe `roteiro.json`, `arte-rascunho.svg` e instruções na tarefa. Eles não são vídeo final. Uma tarefa personalizada de IA pode aprofundar a produção quando autorizada e configurada. Links e métricas de publicações manuais podem ser registrados no painel.

## Director e ensino

Gere relatório manualmente ou aguarde a rotina das 20h. Contratado, recebido, pendências e métricas indisponíveis ficam separados. Em Propor melhoria, registre agente, problema, fonte e técnica. O sistema cria adendo em TEST. Depois do experimento, registre testes, comparação e resultado. Uma avaliação positiva solicita aprovação específica. Só após aprovação o adendo entra no contexto das futuras tarefas. Playbook protegido e segurança não são substituídos.

## Fila e aprovações

Tarefas livres usam IA; rotinas locais indicam que são determinísticas. Dependências só liberam trabalhos quando todas terminam. Falha ou cancelamento de uma dependência bloqueia a sequência. Uma tarefa bloqueada pode ser retomada após revisão enquanto tiver tentativas. Erros temporários têm no máximo duas tentativas; trabalhos Builder interrompidos exigem aprovação para retomar, preservando arquivos.

Aprovações têm validade de 24 horas e escopo explícito. Aprovar não cria integração nem permite outras ações futuras. Solicitação expirada exige novo pedido. Não há compras, cobranças, publicações ou envios efetivos implementados nos adaptadores pendentes.

## Dados e backups

Dados de operação ficam em `runtime/vendrex.sqlite3`. Demonstração usa `runtime-demo`. Preserve essas pastas quando atualizar o código. Faça backup antes de alterações. O botão de backup usa a API SQLite de cópia consistente. Exportação JSON serve para análise; contém dados comerciais e deve ser tratada como informação privada. O código exportado não inclui esses dados.

Para restaurar: pare o servidor, preserve a pasta atual inteira, restaure a cópia para uma nova pasta e inicie `py -3 .\run.py serve --data C:\Vendrex\restaurado`. Não misture banco restaurado com arquivos WAL de outra base.

## Agendador Windows

Nenhuma tarefa permanente é registrada automaticamente. `scripts/register-schedules.ps1` apresenta o plano e exige SIM ou a opção explícita `-Authorize`. Registra inicialização do dashboard no login e verificação da fila a cada minuto. A agenda interna decide 12h/18h/20h em America/Recife, independentemente do fuso do Windows. A trava impede duplicação se o dashboard já está ativo. Remova com `scripts/remove-schedules.ps1`.

## Diagnóstico de problemas

Porta ocupada: encerre outro servidor ou use `--port 8767`. Python ausente: instale 3.11+ e confirme `py -3 --version`. Git ausente: instale Git e reabra terminal. Codex indisponível: confirme CLI oficial e `codex login status`. Saldo não verificado: confira interface oficial e atualize manualmente; nunca use chave de API como solução automática. Processo encerrado: reinicie e revise aprovações de recuperação. Consulte Histórico para tarefa, estado, motivo e duração. O painel mostra os 100 eventos recentes; o banco preserva o histórico completo.
