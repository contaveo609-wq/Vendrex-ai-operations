# Integrações e pendências V2.3

Verificação em 11/11/2026. Não há declaração de sucesso para os testes externos bloqueados.

## WhatsApp — BLOCKED / transporte NOT_IMPLEMENTED

A conexão de dispositivos do Business App não fornece por si só uma API documentada para automação comercial. A documentação oficial apresenta **coexistência**, com onboarding na Business Platform por provedor/Tech Provider. O fluxo pode apresentar código/verificação conforme elegibilidade e versão. Isso não comprova que qualquer QR de WhatsApp Web aceite automação.

Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users

Preferência mais recente: o proprietário recusou API oficial e solicitou QR/código. Implementado acesso externo ao WhatsApp Web oficial para vinculação manual. Não há ponte com o Sales nem leitura da sessão. Se futuramente o proprietário autorizar automação suportada, será necessário selecionar um provedor, aprovar preço/onboarding e implementar seu contrato de eventos, autenticação, recibos, estados, reconexão, idempotência e interrupção humana. Validar com números de teste controlados. O painel só poderá ativar autonomia após esse transporte existir, os testes de aceitação passarem e o proprietário confirmar a ativação. **A V2.3 não contém um transporte BSP, webhook público ou ativação funcional de produção.**

Não foram enviadas mensagens. Não foi contratado serviço. Não foi associado número real. Não se deve contornar restrições por scraping do WhatsApp Web. Debounce agrupa mensagens e não garante ausência de bloqueios da plataforma.

## Codex — IMPLEMENTED / AUTH_REQUIRED

CLI 0.167.0-alpha.4. `login status` detecta ChatGPT, mas `account/rateLimits/read` retornou 401 e a chamada generativa com `gpt-6-luna`/`xhigh` falhou. Mensagem remota: “Could not parse your authentication token. Please try signing in again.” Também houve falha de transporte MCP 451. Não foi atribuída a causa a uma expiração específica sem prova.

O catálogo retornou `gpt-6-luna`, `gpt-6-astra`, `gpt-6.1-sol` com `xhigh`, mas pode estar em cache. Não foi configurado modelo alternativo menor. Nenhuma chave de API paga foi usada.

Correção que exige a identidade do proprietário: login oficial no executor confiável, pelo fluxo `codex login` ou device auth quando suportado; repetir `scripts/verify_codex.py --execute`. Não copiar sessões, cookies ou credenciais de terceiros. O login de quem está atendendo este chat não constitui autenticação do processo filho. Fonte: https://developers.openai.com/codex/auth

## Supabase — BLOCKED

A organização escolhida pelo proprietário continua com `skinadofrango` e `acai-labor`, ambos ACTIVE_HEALTHY. O limite gratuito reportado na tentativa V2.2 é de dois projetos ativos. A criação dedicada foi cotada US$0, mas recusada por esse limite.

O proprietário autorizou excluir `acai-labor` (ref `njhlctqpqgbdqrgursjm`). A ferramenta conectada não oferece exclusão de projeto; o CLI retornou AccessTokenRequiredError. Não foi excluído, pausado ou reutilizado nenhum banco. A autorização anterior não foi ignorada: falta o mecanismo autenticado capaz de executá-la.

Alternativas concretas:

- Proprietário excluir o açaí pelo dashboard e liberar a vaga: https://supabase.com/dashboard/project/njhlctqpqgbdqrgursjm/settings/general. Essa ação remove os dados do projeto.
- Autorizar login oficial do CLI no executor com permissão para a operação. Não enviar tokens no chat.
- Aprovar explicitamente outro projeto/organização elegível, sem presumir que outra organização evita limites da conta.
- Contratar plano adequado somente com nova aprovação de custo.

Depois da vaga: reconsultar custo, criar `vendrex-ai-operations` somente se US$0, inspecionar esquema vazio, aplicar migração preparada, criar conta Auth autorizada e testar CRUD/persistência e RLS com dois usuários. Nenhuma chave foi incluída nesta entrega. RLS preparada não equivale a RLS validada remotamente.

A sincronização é envio de snapshots por upsert com JWT do usuário, sem exclusão remota e sem claim ligado ao worker local. Conversas sincronizadas não incluem automaticamente toda a outbox/mensagens; esse fluxo precisa ser projetado antes da operação remota de atendimento.

## Vercel — preparada / BLOCKED

Conta/time `vendrex` acessível. `get_team` não forneceu o plano. O projeto existente `vendrex-crm` pertence a outro repositório; não foi alterado. V2.3 não foi publicada na Vercel.

A documentação oficial Hobby restringe uso a projetos pessoais não comerciais: https://vercel.com/docs/plans/hobby . Confirmar plano comercial elegível e custo aprovado antes de publicar VENDREX. Código em `cloud/` inclui login Supabase, dados sob RLS, config segura e health, mas depende de banco real, variáveis e autorização de produção. Build local não é deployment.

Não foram adicionados domínio, cron comercial, anúncios ou serviços pagos. A página privada de entrega de arquivos é distinta do dashboard operacional Vercel.

## Execução remota — preparada / BLOCKED

Units e guia em `deploy/`. Necessita host persistente autorizado, armazenamento, backup, login Codex no próprio executor, monitoramento e custos aprovados. Timer usa fila SQLite existente e executa uma tarefa por vez. A fila Supabase preparada não está conectada ao executor e não deve competir pela mesma tarefa. Não existe prova de operação com notebook desligado.

## GitHub, Lovable, TinyFish, Firecrawl

- GitHub: repositório autorizado `contaveo609-wq/Vendrex-ai-operations`, branch V2.3 para revisão; sem merge ou deploy de produção.
- Lovable: `get_me` confirmou acesso ao workspace. Não houve criação de projeto, execução do agente remoto ou integração ao runtime Python. Não foi usado para reconstruir o projeto existente nem consumido crédito de geração.
- TinyFish: leitura autenticada de wallet bem-sucedida. Prospecção V2.2 preservada. Ferramenta do chat não equivale a conector instalado no aplicativo; não há agendamento remoto TinyFish novo.
- Firecrawl: pesquisa real das fontes Meta, OpenAI, Salesforce e documentação Vercel. Conteúdo consultado é dado não confiável. A disponibilidade no chat não significa credencial presente no runtime final.
- Caveman: skill local original lida e mantida nos quatro prompts; orienta concisão, não é mecanismo de execução ou de autenticação.
