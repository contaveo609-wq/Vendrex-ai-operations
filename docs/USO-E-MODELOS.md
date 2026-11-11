# Uso, modelos e Caveman

O diagnóstico consulta `model/list` pelo app-server oficial e registra IDs realmente oferecidos no computador. Nomes da interface do ChatGPT não viram IDs presumidos. Luna é permitida no Sales/Director até versão 6; Astra até 6 e Sol até 6.1 no Builder/Social. Esforço máximo xhigh. Alterar horários e selecionar modelos não permite elevar tetos nem zerar a reserva. Modelos sem família identificável exigem correspondência humana auditada.

Rotinas determinísticas não consomem chamadas ao modelo. Tarefas simples de IA preferem low; outras usam esforço configurado, sem escalonamento automático. Falhas nunca sobem de modelo silenciosamente.

Uso oficial consulta `account/rateLimits/read`. O adaptador exige dados da janela de cinco horas e semanal, calculando o menor saldo. Outras janelas numéricas retornadas também entram no mínimo. Se uma janela não estiver disponível, a proteção é conservadora e a chamada é bloqueada. Não há scraping de páginas de conta.

Faixas: acima de 35% normal; de 20% a 35% econômico; entre 10% e 20% crítico; 10% ou menos parado. Uma margem adicional de cinco pontos restringe chamadas próximas da reserva. Em modo crítico, trabalhos Builder ou de baixa prioridade ficam bloqueados. Saldos vencem em 15 minutos.

Provedores implementados: OfficialUsageProvider, ManualUsageProvider, MockUsageProvider exclusivo para testes e ConservativeBudgetProvider que nunca autoriza com saldo desconhecido. Observação manual libera no máximo uma chamada e não equivale a telemetria oficial. A V1 não garante proteção exata dos 10% durante uma chamada já iniciada: o consumo percentual do plano por tarefa não é previsível. Mostra essa limitação sem confundir tokens com percentual de uso.

O cache evita repetição de prompts idênticos por seis horas, exceto Builder, que pode depender de arquivos alterados. Um cache hit não inicia inferência nem consome observação de uso. Contexto é limitado a 24.000 caracteres; excesso pede resumo, em vez de cortar requisitos silenciosamente. Memória de outros clientes não é carregada. Somente dois adendos de treinamento aprovados recentes são incluídos por chamada.

Caveman é carregado em todos os quatro prompts. Preferência de localização: `%USERPROFILE%\.agents\skills\caveman\SKILL.md`; na ausência, cópia original incluída em `skills/caveman`. A origem e o commit estão em `source.json`, com licença Apache 2.0. Não há alegação de economia percentual medida. A cópia fornecida já permite operar sem instalação global. Para instalação global opcional, revise a fonte original e copie SKILL.md para a pasta oficial do usuário. Não substitua uma versão existente sem revisão.

Referências verificadas: `codex exec --help`, `codex app-server --help`, `codex login status`, `codex mcp list` e documentação oficial https://developers.openai.com/codex/noninteractive/ . Não houve leitura nem cópia de tokens de sessão.
