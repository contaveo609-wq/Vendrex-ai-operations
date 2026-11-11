# WhatsApp Bridge — checkpoint externo após indisponibilidade do executor

Este relatório preserva o estado conhecido da missão. **Não é uma entrega operacional nem contém o ZIP final.**

## Base preservada
V2.3: commit 267a610044e3688054a3baac83d3bc11500ba1ff.
PR anterior: https://github.com/contaveo609-wq/Vendrex-ai-operations/pull/2.
O trabalho novo foi gravado localmente na branch feature/whatsapp-bridge, em /workspace/work/VENDREX-AI-V2.2.
As alterações da bridge não tinham sido commitadas/pushadas antes da desconexão. A sobrevivência desses arquivos ainda precisa ser conferida ao retomar o mesmo ambiente.

## Implementação local realizada antes da queda
- memory/migrations/004_whatsapp_bridge.sql: bridge_inbound, bridge_attempts, bridge_deliveries, bridge_proofs.
- vendrex/bridge/contracts.py: contratos tipados e dataclasses.
- vendrex/bridge/connector.py: UnavailableConnector padrão e MetaCloudConnector opcional, desativado sem escolha/autorização explícita no ambiente. Endpoints oficiais Graph documentados; sem QR emulado, protocolo de dispositivo privado ou credenciais copiadas.
- vendrex/bridge/services.py: ConnectionManager, InboundMessageHandler, LeadEligibilityService, ConversationQueue, SalesInferenceService, OutboundMessageHandler, DeliveryTracker, AuditLogger e WhatsAppBridge.
- vendrex/bridge/webhook.py: servidor separado em loopback, apenas /webhooks/whatsapp, verificação GET e HMAC-SHA256 no POST, conta/número exatos.
- Service, WhatsAppControl, dashboard, run.py e SupabaseStore conectados aos novos componentes.
- Worker contínuo preparado em deploy/vendrex-bridge.service e rota de proxy HTTPS restrita em deploy/webhook-nginx-location.conf.
- Tests de laboratório em tests/test_bridge.py e scripts/verify_bridge_browser.py.
- Guia detalhado local em docs/WHATSAPP-BRIDGE.md.

## Controles implementados
Elegibilidade em todas as fronteiras; consentimento e identidade exatos; bloqueio de desconhecidos, grupos, pessoais e opt-out.
Testes controlados são vinculados a uma conversa/sessão por dez minutos e a uma autorização de ensaio por 24h.
O número de teste não se transforma em alvo regular da autonomia. Seu valor completo permanece apenas na base privada; sufixo0291.
Fila reaproveita a outbox existente, debounce3–10s, revisões, cancelamento e leases.
Estado CONNECTED exige provas reais; transporte de fixture é sempre SIMULATION_ONLY e não registra provas reais.
POST persistido antes do efeito externo; erro ambíguo exige reconciliação e não sofre retry cego.
Entrega recebida por webhook é distinta de aceitação do POST e de confirmação explícita no aparelho.
Acesso ao prompt é limitado ao lead/conversa pertinentes; Codex oficial, preferência Luna6/xhigh, sem API paga alternativa.
Desconexão é local; revogar token da conta é uma operação separada.
Reinício exige validação/reativação, sem prometer retomada autônoma após perda do processo.

## Evidência conhecida
- 125 testes Python passaram: 87 anteriores e 38 da bridge.
- 16 verificações de renderização e escape passaram.
- Chromium: 19 verificações de regressão, 12 da V2.3 e 8 do laboratório da bridge passaram.
- As 8 verificações da bridge usaram HTTP loopback real e eventos assinados/controlados, com transporte e IA de fixture. Não comprovam WhatsApp real.
- Chromium encontrou um defeito no formulário: um input chamado id sobrescrevia form.id. Corrigido usando getAttribute('id'); o formulário do ensaio foi validado depois da correção.
- Uma repetição posterior do navegador após adicionar aviso visual explícito de laboratório estava em andamento; seu resultado final não foi recolhido antes da queda.
- Config cloud: 4 verificações; quadro: 7; calculadora: 17. Build cloud local passou.
- A última tentativa de alterar o tratamento de parada de emergência falhou ao abrir o processo do executor. Não considerar essa alteração aplicada/testada. Esse ponto deve ser conferido antes de qualquer envio real: cancelamento global e modo RUNNING precisam ser rechecados no checkpoint de IA e imediatamente antes do POST.

## Ensaio real: bloqueado, zero mensagens
Número controlado autorizado pelo proprietário nesta conversa: final0291. Não publicar o número completo.
A identidade desse contato não foi validada por mensagem real assinada.
Conexão: PROVIDER_REQUIRED. Nenhum provedor, token, app secret ou webhook HTTPS real configurado.
Codex: AUTH_REQUIRED; nova chamada oficial retornou401, “Could not parse your authentication token”.
Login oficial por dispositivo foi iniciado; código temporário não é armazenado neste relatório. Não houve confirmação de conclusão.
Nenhuma mensagem real recebida. Nenhuma inferência real bem-sucedida. Nenhum envio real. Nenhuma confirmação do destinatário.
Supabase ainda lista dois projetos ativos: skinadofrango e acai-labor. Nenhum banco foi alterado.
Nenhum host persistente, serviço pago, campanha ou produção Vercel foi contratado/publicado.

## Bloqueio adicional confirmado
O executor ccarenv_b64_Y2NhcmVudl80NzljYzEyYTI4Yzg4MTkxOTdiYWZhNDJlYWNhOGI2Mg ficou unavailable/offline.
environment_status confirmou connectivity=offline; diagnóstico retornou history_status=not_found.
Uma nova tentativa de comando retornou “No usable execution environment is available”.
Não foi possível recuperar arquivos, coletar os últimos processos, gerar/verificar ZIP ou publicar o pacote da bridge.
Este relatório foi salvo pelo conector GitHub, que continuava disponível.

## Retomar
1. Reativar o mesmo ambiente e conferir git status e todos os arquivos locais antes de supor preservação.
2. Conferir/corrigir parada de emergência; executar testes ligados à alteração.
3. Conferir o resultado do login oficial Codex e repetir scripts/verify_codex.py --execute. Nunca copiar cookies/auth.json nem usar credenciais de terceiros.
4. Selecionar/autorizar alternativa de conexão suportada, se o proprietário aceitar. A preferência QR sem API não fornece por si só um contrato documentado para a bridge.
5. Configurar segredos no ambiente e HTTPS/host aprovado, sem custos não autorizados.
6. Executar o ensaio real completo com o número já autorizado e confirmar recebimento. Não substituir por fixture.
7. Commitar a implementação, revisar, gerar e verificar VENDREX-AI-OPERATIONS-V2.3-WHATSAPP-BRIDGE.zip, varrer credenciais/número privado e entregar.
