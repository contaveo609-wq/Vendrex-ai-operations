# Verificação V2.3 — escopo e evidência

Executado em Linux, Python 3.12, Node.js e Chromium real via Playwright. Não é validação Windows.

| Conjunto | Resultado | Escopo |
|---|---|---|
| Python unittest | 87 passaram | Fila, políticas, migrações, HTTP, consentimento, debounce, recuperação, takeover, outbox, importações e sincronização com fixtures |
| Dashboard VM | 16 verificações | Renderização e escape; não substitui navegador |
| Config cloud Node | 4 verificações | Chave secreta bloqueada, URL e config; sem serviço externo |
| Quadro Node | 7 verificações | Contrato de dados |
| Calculadora Node | 17 testes | Aritmética e entradas |
| Chromium regressão | 19 verificações | Dez rotas anteriores, calculadora, vídeo32s, Range, reprodução durante refresh e mobile |
| Chromium V2.3 | 12 verificações | Quadro, persistência, exportação, XSS, quota/corrupção, mobile, controles WhatsApp, link oficial de login e análise identificada |
| Build cloud | Passou | Compilação estática local; sem deploy |
| Git diff | Passou | Sem erros de whitespace |

## WhatsApp

Os testes usam exclusivamente contatos e transportes de fixture, identificados em código. Não houve contato com números reais. A variante de envio é SIMULATION_ONLY e não é exposta pelo HTTP do app.

Validados localmente: número exato, banco/lead, prospecção Sales, consentimento e prazo, desconhecido, pessoal, bloqueado, grupo, opt-out em frase, janela3–10s, cancelamento por nova mensagem, deduplicação, geração repetida, geração falha, lease expirado, envio ambíguo, takeover e preservação de nova revisão.

**Não executados:** vinculação com conta WhatsApp real, status de sessão externa, reconexão, webhook, recebimento/envio real, recibos e recuperação pelo provedor. O usuário escolheu QR/código sem API. Chromium verificou apenas que o link abre o endereço oficial com noopener; não há afirmação de que o login aconteceu.

## Agentes

- Sales: prospecção real V2.2 preservada, CRM local e propostas supervisionadas. Negociação generativa completa não foi comprovada; AUTH_REQUIRED.
- Builder: tarefa BUILDER_BOARD executada pelo worker, arquivos reais, fases documentadas, contrato Node e commit Git. Chromium testou persistência e erros. Geração é scaffold determinístico; programação livre não validada.
- Growth: vídeo MP4 V2.2 preservado e duração32s/reprodução confirmadas na V2.3. Análise usa dataset SIMULATION_ONLY com gasto100, impressões10000, cliques200, leads10, aquisições2: CPM10, CTR2%, CPC0,5, CPL10, CAC50. Receita/ROAS permanecem ausentes sem venda/atribuição real.
- Director: fonte Salesforce acessada via HTTP real, trecho `active listening` confirmado no texto, deficiência e técnica registradas, dois cenários com respostas importadas fictícias. A rubrica literal passou de0 para1; isso não mede inteligência do modelo. Candidato TEST e solicitação de promoção criados; nada promovido.

## Infraestrutura e falhas reais

- Codex: nova chamada generativa Luna6/xhigh falhou com401. Probe `account/rateLimits/read` também401. Catálogo retornou IDs mas pode estar em cache.
- Supabase: dois projetos ativos listados; sem vaga e sem ferramenta autenticada de exclusão. RLS e Auth do projeto VENDREX não foram testadas remotamente.
- Vercel: conta acessível, plano não exposto pela ferramenta. Doc Hobby confirma restrição comercial. Sem publicação operacional.
- Host remoto: nenhum provisionado. Units não equivalem a execução contínua comprovada.
- Fonte Salesforce inicialmente errada retornou404; pesquisa localizou a URL correta. O erro consta na evidência.
- Chromium detectou formulário visível sobre armazenamento corrompido: corrigido e revalidado. Um seletor de teste ambíguo entre Ativar e Desativar foi corrigido com correspondência exata, sem alterar o produto para mascarar erro.

Os testes externos de aceitação permanecem incompletos. Consulte o relatório JSON e os logs em `evidence/v23/`. Capturas do quadro são de uma aplicação local real; dados da campanha são explicitamente de teste.
