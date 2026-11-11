# Brief para resolver a integração própria do WhatsApp da Vendrex

## Objetivo

Investigar e, se houver um caminho tecnicamente viável e permitido, implementar uma integração própria e auto-hospedada entre o WhatsApp Business do proprietário e o agente VENDREX SALES.

O proprietário quer controlar o software e a infraestrutura da integração. Ele **não quer usar a API oficial da Meta nem contratar um provedor/BSP terceirizado**. A experiência desejada é vincular o WhatsApp por QR Code ou código de pareamento, semelhante à vinculação de dispositivos do WhatsApp.

Não trate essa preferência como prova de que a plataforma oferece uma interface de automação. Primeiro determine o que o vínculo autoriza e quais interfaces são documentadas e permitidas.

## Projeto existente

Trabalhe sobre o VENDREX AI OPERATIONS V2.2/V2.3 já existente. Preserve a arquitetura e os agentes. Não recrie o sistema inteiro.

Há uma tentativa anterior de criar `VENDREX_WHATSAPP_BRIDGE`, com contratos de conector, fila por conversa, elegibilidade, debounce, auditoria, painel e testes locais. O relatório de checkpoint está em `docs/WHATSAPP-BRIDGE-CHECKPOINT.md` na branch `recovery/whatsapp-bridge-20261111`. Leia o código e verifique o estado real antes de assumir que qualquer parte foi integrada ou validada.

O ambiente de trabalho ficou indisponível antes de o código novo ser publicado e empacotado. Confirme se os arquivos locais ainda existem. O checkpoint público é somente um relatório; não o descreva como contendo a implementação.

## Preferências e limites

- Não integrar a Meta Cloud API.
- Não contratar ou depender de um BSP/provedor terceirizado.
- Preferir QR Code ou código de pareamento do próprio WhatsApp.
- Hospedar e controlar a bridge própria, se houver um mecanismo permitido.
- Não usar cookies copiados, sessões de terceiros, endpoints privados descobertos por engenharia reversa, falsificação de cliente/dispositivo, evasão de limites, anti-spam, autenticação ou fiscalização.
- Não afirmar que QR significa autorização para automação irrestrita.
- Não simular sessão, recebimento, envio, entrega ou confirmação do destinatário.
- Se não existir um método documentado que atenda aos requisitos sem API oficial ou BSP, declare o bloqueio com evidências e explique a decisão. Não substitua silenciosamente a escolha do proprietário por Cloud API ou BSP.

## Primeira etapa: responder se a ideia é viável

Antes de codificar o transporte, pesquise fontes atuais e primárias do WhatsApp/Meta e responda:

1. O que o QR ou código de pareamento autoriza tecnicamente?
2. Existe interface documentada para um serviço independente receber e enviar mensagens usando essa sessão?
3. O uso comercial automatizado é permitido nesse modelo?
4. Quais riscos existem para desconexão, perda da sessão, privacidade e bloqueio da conta?
5. É possível manter uma implementação própria sem API oficial, sem BSP e sem usar protocolos internos não documentados?
6. Quais partes podem ser implementadas com segurança mesmo se o transporte não for viável?

Cite URLs, data de consulta e trechos relevantes. Diferencie claramente evidência oficial, inferência e incerteza. Não use o nome de uma biblioteca como prova de autorização ou estabilidade.

## Arquitetura desejada, caso exista transporte permitido

Manter interfaces desacopladas:

- `WhatsAppConnector`
- `ConnectionManager`
- `InboundMessageHandler`
- `LeadEligibilityService`
- `ConversationQueue`
- `SalesInferenceService`
- `OutboundMessageHandler`
- `DeliveryTracker`
- `AuditLogger`

O conector deve expor operações tipadas equivalentes a conectar, desconectar, consultar estado, receber, enviar e reconectar. O status CONNECTED só pode vir de sessão válida e prova real de comunicação.

A aplicação deve mostrar método real de conexão, estado, número conectado com máscara, última sincronização, erros, reconexão, desconexão e pausa imediata da automação. QR/código deve ser dinâmico e vir do mecanismo validado; não usar imagem ou valor demonstrativo.

Separar painel web da execução contínua se necessário. Não presumir que funções serverless mantenham sessão persistente. Não contratar infraestrutura nem publicar em produção sem autorização já registrada.

## Regras de atendimento

O Sales só pode responder se todas as condições forem verdadeiras:

1. Lead registrado e prospectado pelo Sales.
2. Contato verificado.
3. Consentimento de atendimento registrado. Prospecção, sozinha, não é consentimento.
4. Conversa individual, nunca grupo.
5. Sem opt-out, bloqueio ou transferência humana.
6. Sessão e transporte realmente conectados.
7. Automação ativada explicitamente pelo proprietário.

Implementar fila por conversa, deduplicação, idempotência, recuperação segura, debounce configurável de 3 a 10 segundos e cancelamento/reinício quando chega mensagem nova. Pausa humana ou emergência deve cancelar geração e impedir envio pendente.

A resposta deve ser contextual, usar os pilares comerciais da Vendrex sem pressão, e nunca inventar preços, garantias, provas sociais ou compromissos.

## IA do Sales

Use somente autenticação oficial realmente disponível no ambiente. Não use cookies, sessões copiadas, credenciais de terceiros, chave inventada ou assinatura ChatGPT como se fosse crédito de API.

Investigue o erro 401. Se for necessária nova autenticação oficial, interrompa apenas a geração de IA, descreva a ação exata para o proprietário e continue as tarefas independentes. Sem IA real, não retorne resposta pronta como se tivesse sido gerada pelo Sales.

## Teste controlado

O proprietário autorizou previamente um número de teste controlado para este ensaio. Recupere-o apenas do registro privado já existente; não o publique neste documento, em commits, logs, screenshots ou relatório público.

Não envie nada até haver transporte permitido, autenticação funcional, consentimento de teste válido e estado de conexão comprovado. O teste deve ser iniciado pelo proprietário e não pode atingir contatos desconhecidos.

Validar, com evidência verificável:

- vincular e desconectar;
- estado conectado de sessão verdadeira;
- receber mensagem real;
- gerar resposta contextual com IA real;
- enviar e confirmar a resposta no dispositivo destinatário;
- continuidade;
- contato desconhecido bloqueado;
- grupo bloqueado;
- opt-out;
- interrupção humana;
- deduplicação e debounce;
- falha e recuperação sem envio duplicado.

Testes com fixtures, navegador local, mock ou conector de laboratório devem ser marcados SIMULATION_ONLY e nunca contam como teste real.

## Critérios de status

Para cada função e integração, usar um estado honesto:

- IMPLEMENTED
- TESTED
- CONNECTED
- AUTH_REQUIRED
- BLOCKED
- SIMULATION_ONLY
- NOT_IMPLEMENTED

Não declarar o WhatsApp Bridge operacional sem recebimento e envio reais confirmados no dispositivo de teste.

## Entrega

Entregar:

- alteração no código existente e revisão de segurança;
- documentação do mecanismo escolhido e seus limites;
- testes automatizados e evidências separadas por teste real ou simulado;
- configuração de instalação sem segredos;
- relatório explícito de bloqueios e ações do proprietário;
- ZIP `VENDREX-AI-OPERATIONS-V2.3-WHATSAPP-BRIDGE.zip`, somente se o arquivo for realmente criado e verificado.

Não publicar em produção nem incluir credenciais. Se a opção sem API/BSP não tiver caminho documentado e permitido, entregue o diagnóstico e uma bridge segura em modo pausado, sem fingir que a conexão própria já funciona.
