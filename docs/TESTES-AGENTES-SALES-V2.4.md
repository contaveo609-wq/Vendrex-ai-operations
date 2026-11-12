# Vendrex V2.4: resultado dos quatro agentes

Atualizado em 12/11/2026. Branch: `upgrade/v2.4`.

**Sales ainda não está operacional no WhatsApp.** Não houve telefone vinculado nem conversa real completa. `SALES_WHATSAPP_OPERATIONAL = FALSE`. A entrega inclui implementação, testes e pendências comprovadas.

## O que cada agente fez

| Agente | Execução comprovada | Arquivo para conferir | Limite atual |
| --- | --- | --- | --- |
| Sales | Criou perguntas comerciais com IA real. Backend próprio gerou texto real; fila, sessão, pausa, opt-out e edição de personalidade foram testados. | [Resposta](agent-tests/sales/resultado-inferencia.md) | Nenhuma mensagem WhatsApp real; qualidade comercial do modelo próprio ainda precisa de validação. |
| Builder | Construiu calculadora executável por ferramentas locais, criou branch/commit e passou em 17 testes aritméticos e quatro verificações em Chromium. O perfil de IA também produziu um plano. | [Calculadora](agent-tests/builder/calculadora/index.html), [plano](agent-tests/builder/resultado-inferencia.md) | Sem deploy comercial externo. |
| Growth | Renderizou e verificou um MP4 vertical real de 32 segundos com trilha original, além de gerar legenda e roteiro com IA. | [Legenda e roteiro](agent-tests/growth/resultado-inferencia.md) | Sem autorização Meta concluída ou publicação real. |
| Director | Avaliou a telemetria fornecida e identificou corretamente falta de servidor e telefone, sem declarar Sales ou Growth operacional. | [Parecer](agent-tests/director/resultado-inferencia.md) | Entrada controlada; não comprova executor remoto contínuo. |

Sales perguntou: “Em que etapa os pedidos costumam se perder hoje?” e “Que impacto verificável isso tem na rotina ou nas vendas?”.

Growth escreveu: “O cliente pediu sem cebola. A cozinha viu o recado? Reúna itens e observações no mesmo pedido. Converse com a Vendrex sobre pedidos digitais.”

Os resultados completos estão em `agent-tests`. Não foram pesquisados números nem iniciada prospecção. O roteiro informado pelo proprietário ficou como referência, sem ativação.

## Implementação do Sales

Baileys por QR, autorizado pelo proprietário, com IA própria. Sem WhatsApp Business Platform, BSP, agente de IA nativo da Meta ou API de IA paga. Sessão criptografada no Supabase, lease exclusivo, identidade telefone/LID, histórico, debounce de cinco segundos, fila durável, deduplicação e retentativas limitadas. Aceitação, entrega e leitura são eventos distintos. Envios ambíguos não são repetidos automaticamente.

O painel privado do gateway e a aba **Sales e personalidade** do painel Cloud têm campos para personalidade, instruções, abertura, pedido de permissão e texto-base da proposta. As mudanças persistem no Supabase e invalidam gerações antigas antes do envio. Os endpoints Cloud exigem usuário autenticado e cadastro de operador. Pausa, transferência humana e opt-out foram incluídos.

O teto inicial é de 500 gerações e 1.000 processamentos por dia, configurável no backend. Cinquenta conversas com seis respostas exigem 300 gerações; retentativas e outras conversas também consomem capacidade. Isso não representa uma cota oficial de WhatsApp nem garantia contra bloqueios.

## Testes

- 92 testes Python aprovados.
- 59 testes Node de integrações/proxies e 12 do gateway aprovados.
- 16 verificações de renderização e quatro de configuração pública aprovadas.
- Chromium real no Windows: dez verificações Cloud e sete do gateway, sem erros JavaScript.
- Builder: 17 testes aritméticos e quatro verificações adicionais no navegador.
- Dois conjuntos de testes no Postgres real, com fixtures revertidas: lease, autenticação persistida, aliases, debounce, duplicação, recibos, personalidade, pausa, opt-out e recuperação após falha.
- Quatro perfis com inferência real pelo CLI oficial, com entradas controladas e guard de uso ativo.
- Inferência real com Ollama atrás de backend autenticado; chamada sem token retornou 401. Gemma 3 1B levou cerca de 21 segundos e Gemma 2 2B cerca de 76 segundos no teste local. As respostas foram genéricas; a qualidade comercial final não foi aprovada. Uma tentativa com o Qwen já instalado falhou e não foi configurada no gateway.
- Build Cloud aprovado. Build Docker não executado: Docker não está instalado nesta máquina.

Testes com transportes controlados e fixtures SQL não comprovam conversa real. Os testes por CLI não substituem backend de produção. Evidências e logs: `evidence/sales-v24`.

## Estado remoto

Supabase `ryxxpbxbjzijcuxgfgja`: Edge Function Sales versão 4 implantada, health `HOST_REQUIRED`, transporte `BAILEYS_QR`, modo TEST pausado. Entradas: 0; saídas: 0; usuários Auth: 0; operadores: 0. Prova operacional falsa. Nenhuma credencial de WhatsApp Business Platform foi configurada. O webhook oficial permanece desativado e o worker Cloud não executa o gateway Baileys.

As tabelas Sales não concedem acesso a `anon`, `authenticated` ou `PUBLIC`; a função de personalidade é restrita ao backend. Não foram criadas sessões ou identidades administrativas fictícias.

## Vercel e operação 24 horas

A equipe Vercel foi verificada novamente em 12/11/2026 e está no plano Hobby. Esse plano permite uso pessoal não comercial; a definição considera finalidade financeira, mesmo com um único usuário. Não houve deploy comercial, upgrade, compra ou alteração do CRM existente.

Containers Vercel escalam para zero após cinco minutos sem tráfego em produção. Não foram criados pings ou loops para contornar essa condição. Publicar o painel não mantém os quatro executores ativos 24 horas.

O gateway e a inferência própria precisam de servidor permanente. Uma opção pesquisada é Oracle Always Free, sujeita a capacidade, cotas e recuperação de instâncias ociosas. O proprietário informou que ainda não tem servidor ou conta nessa plataforma. Nenhum recurso pago foi contratado.

## Lista única do que falta

1. Disponibilizar e autenticar hospedagem permanente elegível. O cadastro gratuito e eventuais verificações exigem o titular; a Vercel atual não atende ao uso comercial pretendido. Não enviar senhas ou chaves no chat.
2. Instalar o gateway/modelo no servidor e validar desempenho e qualidade comercial da IA nesse ambiente.
3. Com o celular, vincular o WhatsApp Business por QR e indicar um contato autorizado para teste.
4. Comprovar conversa real, entrega e nova interação após reiniciar o worker. Só então verificar a hospedagem e liberar a condição operacional.
5. Para usar o painel Cloud, concluir a identidade do dono no Supabase Auth e cadastrá-la como operadora. Os outros agentes também exigem executor remoto e autenticação suportada; Growth ainda precisa de autorização Meta e publicação real.

## Fontes e instalação

- [Vercel: uso comercial](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)
- [Vercel: ciclo de vida dos containers](https://vercel.com/docs/functions/runtimes/container#scale-in-behavior)
- [Oracle: Always Free](https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Baileys: sessão em banco de dados](https://baileys.wiki/authentication/session-management)
- [WhatsApp: política de mensagens](https://business.whatsapp.com/policy)
- [Ollama: API de chat](https://docs.ollama.com/api/chat)

Instalação e arquitetura: `sales-gateway/README.md` no pacote de código. Os segredos estão fora dos entregáveis.

Vídeo de teste local: [MP4 de 32 segundos](agent-tests/growth/vendrex-32s.mp4). Não foi publicado na Meta.
