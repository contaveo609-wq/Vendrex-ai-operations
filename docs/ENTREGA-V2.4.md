# Entrega V2.4 — estado comprovado

**Growth não operacional. Publicações reais confirmadas: zero.** A implementação avançou até os bloqueios de autorização Meta e hospedagem comercial elegível, sem contratar recursos pagos.

| Item solicitado | Resultado |
|---|---|
| Repositório | `contaveo609-wq/Vendrex-ai-operations` |
| Branch/base | `upgrade/v2.4`, derivada de `267a610044e3688054a3baac83d3bc11500ba1ff` |
| Supabase | `ryxxpbxbjzijcuxgfgja`, `vendrex-ai-operations`, São Paulo — CONNECTED / TESTED |
| Infraestrutura Growth | Edge Function `growth`, Cron por minuto, fila durável, Vault, RLS e bucket `growth-media` — CONNECTED / TESTED |
| Sales | TESTED localmente e com inferência real em entrada fictícia; operação autônoma externa BLOCKED |
| WhatsApp | BLOCKED; nenhum transporte não oficial instalado ou número usado em teste |
| Instagram/Facebook | IMPLEMENTED / TESTED com respostas controladas / AUTH_REQUIRED no ambiente real |
| Builder | TESTED; scaffolds, testes Node/Git e inferência real de interpretação; sem deploy de cliente |
| Growth | IMPLEMENTED / TESTED; worker remoto ocioso, sem conta Meta autorizada e sem publicação real |
| Director | TESTED; relatórios e inferência com telemetria controlada; gerente remoto contínuo BLOCKED |
| Vercel | Painel e proxy IMPLEMENTED / TESTED; URL comercial não publicada |
| Custos | Projeto Supabase cotado US$ 0/mês; nenhuma mensalidade de intermediário, API paga, upgrade ou anúncio contratado |

## Implementação

OAuth Facebook Login for Business, Páginas e Instagram profissional vinculado, publicação de JPEG/MP4/Reels nos endpoints oficiais, agenda 12h/18h America/Recife, tokens AES-GCM com chave no Vault, derivação de tokens de Página quando suportada, alertas de reautorização, retentativas limitadas, lease e deduplicação, confirmação remota com permalink, métricas disponíveis e aba de integrações. A fila só publica conteúdo existente e enfileirado. A pesquisa editorial remota contínua e inferência comercial permanente não foram declaradas concluídas.

As verificações finais abrangem 92 testes Python, 32 testes Node da integração/proxy, 20 verificações adicionais de renderização/configuração, oito verificações de navegador no Windows, quatro perfis com inferência real em entradas controladas e testes SQL no Supabase real. Build concluído. Consulte [matriz](TESTES-V2.4.md) e `evidence/v24/validation.json` para limites e evidências.

## Bloqueios atuais

1. O titular informou login pessoal na Meta. O app OAuth, configuração de Login for Business, IDs de Páginas permitidas e consentimento das contas da Vendrex ainda não foram configurados. Login pessoal não comprova consentimento do app. O controle do Edge foi interrompido por falha ao determinar a URL atual com confiança; nenhuma barreira foi contornada. Faltam o teste real de publicação e seu permalink.
2. A conta Vercel autenticada está no plano Hobby, que restringe uso a projetos pessoais não comerciais. Não houve deploy da operação comercial ou contratação de upgrade. O projeto CRM existente foi preservado. [Restrição oficial](https://vercel.com/docs/plans/hobby).
3. Não há operador de produção registrado no Supabase Auth. O painel mantém autenticação obrigatória e não fornece sessão administrativa artificial. O executor remoto dos demais bots e um backend comercial de IA sem dependência de sessão de desenvolvimento também não foram provisionados.

O código Cloud foi testado em navegador isolado com respostas controladas, identificadas como tal. Isso não é uma URL Vercel publicada. O backend remoto responde em `/functions/v1/growth/health`, mas seu estado atual é AUTH_REQUIRED e `operational=false`.

Pesquisa com Caveman, TinyFish e Firecrawl. Aplicadas orientações de Supabase/Postgres, Vercel e OpenAI Docs. Nenhuma conta foi autenticada por engenharia reversa e nenhum segredo foi incluído nesta entrega.
