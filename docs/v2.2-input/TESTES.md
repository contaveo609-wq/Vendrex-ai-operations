# Plano de testes de aceitação

1. Prospectado + consentimento válido + mensagem recebida: resposta única após janela 3–10s, se conector autorizado ativo.
2. Prospectado SEM consentimento: nenhuma resposta automática.
3. Contato não prospectado: nenhuma resposta.
4. Família/amigo/grupo: nenhuma resposta.
5. Opt-out ou bloqueio: nenhuma resposta, cancelar fila.
6. Duas mensagens em 2 segundos: uma resposta agrupada, sem duplicidade.
7. Nova mensagem durante geração: reavaliar contexto e evitar resposta desatualizada.
8. Humano assume: parar envios e cancelar pendentes.
9. Desconexão/reconexão: não reenviar duplicatas.
10. Sales aplica quatro pilares corretamente, sem inventar dores ou provas.
11. Director resume vídeo com fonte, extrai hipótese, valida cenários e registra revisão sem remover guardrails.
12. Builder conclui tarefa real com testes e PR.
13. Growth analisa métricas com origem identificada, não altera orçamento sem aprovação.
14. Supabase RLS: usuários não conseguem acessar dados indevidos; segredos não aparecem no frontend.
15. Vercel: autenticação, rotas e cron compatíveis.
16. Codex: identificar modelo oficial, autenticação permitida, execução real e limites.
17. Notebook desligado: tarefa agendada executa somente se executor remoto real existir.
18. Falha de integração: interface exibe BLOCKED/AUTH_REQUIRED, nunca CONNECTED.
