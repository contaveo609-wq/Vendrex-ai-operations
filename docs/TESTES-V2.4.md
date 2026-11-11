# Matriz de testes V2.4

Ambiente: Windows, Python 3.14 e Node.js 24. Chromium isolado; nenhum perfil pessoal foi copiado. Mocks são explicitamente identificados abaixo. A execução é reproduzível; nenhuma aprovação de publicação real é inferida de um mock.

| Área | Testes executados | Limite da comprovação |
|---|---|---|
| Sales | Consentimento, elegibilidade, debounce, interrupção humana, fila, histórico, falhas e inferência real com lead fictício | Nenhum recebimento ou envio WhatsApp real |
| Builder | Briefings, calculadora e quadro, testes Node, Git local, artefatos e inferência real de planejamento | Sem deploy de cliente ou integração Lovable em produção |
| Growth | OAuth, estado/cookie, formatos, tokens cifrados, fases de publicação, cotas, falhas, reconciliação, métricas e inferência real de conteúdo | Respostas Meta controladas; zero publicações reais |
| Director | Relatórios, avaliação, restrições, monitoramento e inferência real com telemetria controlada | Sem gerente remoto contínuo ou promoção autônoma de políticas |
| Supabase | Migrações reais, isolamento de proprietários, grants, fila, deduplicação, lease, recuperação e OAuth de uso único | Testes SQL com fixtures revertidas; nenhum usuário de produção criado |
| Edge Function/Cron | Health HTTP 200, acesso sem credencial negado, worker invocado remotamente e heartbeat persistido | Worker ocioso enquanto OAuth Meta está pendente |
| Dashboard | Renderização, escape, login, quatro agentes, formulário, logout e celular de 390px em Chromium real | Backend controlado no teste visual; não é prova de deploy Vercel |
| Vercel | Build estático, proxy, cookies, bloqueio de origem e configuração pública sem segredos | Deploy bloqueado pelo plano Hobby comercialmente inelegível |

## Comandos

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
python scripts/verify_growth_browser.py --out CAMINHO_DE_EVIDENCIAS
python scripts/verify_agents_v24.py --out CAMINHO_DO_RELATORIO.json
```

O último comando consome créditos incluídos do CLI oficial. É separado da regressão offline, faz chamadas limitadas, consulta a telemetria e preserva a reserva configurada. Não utiliza API paga. Para repetição direcionada, acrescente `--agent sales|builder|growth|director`.

`supabase/tests/growth.sql` foi executado no PostgreSQL real do projeto dedicado. Testa isolamento entre dois proprietários, ausência de acesso anônimo/cliente a tokens e funções privilegiadas, prova de publicação, duplicações, claim único, lease expirada e replay OAuth. A transação final é revertida. Não publica nada na Meta.

## Falhas encontradas e corrigidas

- Backups SQLite deixavam conexões abertas. No Windows, isso impedia limpeza e recuperação. Agora as conexões são fechadas explicitamente.
- Configurações UTF-8 eram lidas com encoding padrão do Windows, impedindo inicialização dos quatro perfis. Leitura agora é explícita.
- O próprio teste de backup mantinha um handle aberto. Corrigido sem alterar sua verificação de consistência.
- Uma inferência Sales listou um arquivo inexistente como entrega. O adaptador agora rejeita isso, e o prompt esclarece que o contexto da empresa já está incluído. Regressão específica e repetição real do Sales executadas.
- A primeira rodada do Director não concluiu e permaneceu QUEUED. Não foi contada como aprovada. Uma repetição direcionada de cenário simples concluiu. O script de diagnóstico passou a salvar auditoria e estado em caso de falha.
- Índices ausentes apontados pelo advisor foram adicionados. Tabelas exclusivas do backend mantêm RLS sem políticas para clientes, intencionalmente; avisos informativos correspondem a essa negação de acesso.
- O advisor também sinaliza o registro da extensão `pg_net` em public. A inspeção real mostrou extensão não relocável, todas as suas funções no schema `net` e zero funções da extensão em public. O aviso foi registrado; a extensão ativa não foi removida ou recriada, preservando filas e logs.

Evidências finais e contagens estão em `docs/evidence/v24/validation.json`. Screenshots com `CONTROLLED` identificam fixtures visuais, não contas conectadas.
