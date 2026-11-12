# VENDREX AI OPERATIONS V2.4

Atualização Sales: gateway Baileys por QR e editor de personalidade implementados; teste real WhatsApp e servidor permanente pendentes. Painel privado preparado para Netlify Free: [instalação](netlify-site/README.md). Resultados dos quatro agentes e bloqueios: [relatório](docs/TESTES-AGENTES-SALES-V2.4.md). `SALES_WHATSAPP_OPERATIONAL = FALSE`.

Evolução da V2.3, base `267a610044e3688054a3baac83d3bc11500ba1ff`, branch `upgrade/v2.4`. Quatro perfis locais e backend Growth remoto no Supabase. OAuth Meta, publicação oficial, fila durável, tokens cifrados e painel de integrações implementados. **Growth ainda não operacional: nenhuma publicação real confirmada.**

Consulte [entrega V2.4](docs/ENTREGA-V2.4.md), [integração Meta](docs/INTEGRACAO-META-V2.4.md) e [testes](docs/TESTES-V2.4.md). Supabase dedicado criado sem custo contratado; Cron e Edge Function verificados. O plano Vercel atual é Hobby e não permite uso comercial: não houve deploy ou contratação. Os quatro bots foram testados com inferência real local e entradas controladas; isso não valida um backend comercial contínuo baseado em assinatura ChatGPT. Os detalhes históricos abaixo da V2.3 não substituem a entrega V2.4.

## Instalar e abrir

Python 3.11+ para o painel. No Windows, extraia o ZIP, abra a pasta `VENDREX-AI` e execute `Iniciar.cmd`. No terminal:

```sh
python run.py serve --open
```

Acesse `http://127.0.0.1:8766`. O endereço é local ao computador que executa o processo. A base fica em `runtime/`. A primeira migração da V2.2 faz backup antes de alterar o esquema e preserva os registros. Faça uma cópia adicional de sua pasta de dados antes de atualizar. Não sobrescreva `runtime/` com uma demonstração.

Node.js e Git são necessários para as missões Builder. FFmpeg, ffprobe e Pillow (`python -m pip install -r requirements-media.txt`) são necessários para gerar vídeos. As quatro missões V2.2 continuam disponíveis em `Missoes.cmd`; o novo quadro persistente pode ser solicitado na página Builder. A implementação do quadro usa scaffold determinístico, sem alegar programação generativa.

## Situação real

| Recurso | Estado | Evidência e limite |
|---|---|---|
| Quatro perfis, fila, CRM, agendas | TESTED | Persistência SQLite e testes locais; agendas precisam de executor ativo |
| WhatsApp: controles e histórico local | TESTED | Painel, elegibilidade, cancelamento, recuperação; sem eventos WhatsApp reais |
| WhatsApp: transporte e autonomia verificável | IMPLEMENTED / HOST_REQUIRED | Gateway Baileys por QR implementado; servidor permanente, telefone e conversa real pendentes |
| Codex CLI local | TESTED / CONNECTED | Inferência real dos quatro perfis com entradas controladas; sem API paga ou implantação como backend público |
| Builder: calculadora e quadro persistente | TESTED | Node, Git e Chromium; geração por scaffold local |
| Growth: vídeo 32s | TESTED | MP4 V2.2 preservado, verificação de duração/reprodução na V2.3 |
| Growth: importação/análise de campanhas | TESTED | Fonte, moeda, período, hash e deduplicação; dataset de aceitação SIMULATION_ONLY |
| Meta Ads/Google Ads | NOT_IMPLEMENTED | Sem conta publicitária conectada ou dados reais recebidos |
| Director: fonte e avaliação estruturada | TESTED | Fonte Salesforce acessada; respostas importadas e rubrica literal; promoção pendente |
| Inferência dos perfis | TESTED | Entradas controladas; não constitui validação de vendas, treinamento ou negociação em produção |
| Supabase | CONNECTED / TESTED | Projeto dedicado, migrações aplicadas e testes reais de RLS/fila |
| Vercel | IMPLEMENTED / BLOCKED | Painel compila; conta Hobby não permite uso comercial; nenhum upgrade contratado |
| Worker remoto Growth | CONNECTED / TESTED | Edge Function e Cron executam; sem OAuth Meta ou publicação real |
| Publicação Instagram/Facebook | IMPLEMENTED / TESTED / AUTH_REQUIRED | Integração oficial validada com fixtures; contas da Vendrex ainda não autorizadas no app |

Estados são descritos em [ENTREGA](docs/ENTREGA.md). `CONNECTED` exige uma conexão real validada; configuração, catálogo e teste com fixture não bastam.

## WhatsApp

Página **WhatsApp Sales**: status, motivo do bloqueio, janela de 3–10s, desligamento e conversas/transferência humana. O link de vinculação abre o WhatsApp Web oficial em outra aba; a sessão externa não é observada pelo Sales. Ativar fica indisponível enquanto faltar um transporte suportado e testado. Não existe endpoint de importação que transforme mensagens fictícias em mensagens WhatsApp.

O proprietário escolheu QR/código sem API. O acesso manual ao WhatsApp Web respeita essa preferência, mas não fornece mensagens nem uma sessão verificável ao Sales. A autonomia permanece indisponível. A alternativa documentada com coexistência de provedor não foi aceita nem contratada. Não foram instalados clientes que automatizam WhatsApp Web.

## Autenticação oficial do Codex

Execute `Autenticar-Codex.cmd` no Windows, ou faça `codex login` no executor autorizado. Se o fluxo de navegador não funcionar, consulte a documentação oficial e `codex login --help` antes de usar `codex login --device-auth`.

```sh
python scripts/verify_codex.py --execute --out runtime/codex-verification.json
python run.py diagnose
```

O teste só informa CONNECTED após inferência estruturada bem-sucedida. Não copie `auth.json`, cookies ou sessões. Não envie tokens no chat. Assinatura ChatGPT não equivale a créditos da API. Não há fallback para API paga. Os IDs retornados pelo catálogo foram `gpt-6-luna`, `gpt-6-astra` e `gpt-6.1-sol`, com `xhigh`; o próprio catálogo pode estar em cache e não comprova autorização de uso.

## Verificar

```sh
python -m unittest discover -s tests -v
node tests/test_dashboard.cjs
node tests/test_cloud_config.cjs
node templates/board/test.cjs
node examples/calculator/test.cjs
node --check dashboard/app.js
npm --prefix cloud run build
```

Testes Chromium opcionais exigem Playwright e Chromium já instalados, uma base de missões executadas e os caminhos corretos:

```sh
python scripts/verify_mission_browser.py --data runtime-missions --out runtime-verification
python scripts/verify_v23_browser.py --data runtime-missions --out runtime-v23-verification
```

O segundo script exige uma missão BUILDER_BOARD concluída e a campanha de teste identificada. Os artefatos e cenários desta entrega estão documentados em [TESTES-V2.3](docs/TESTES-V2.3.md). Windows e host systemd não foram executados nesta sessão.

Leia [falhas corrigidas](docs/CORRECOES-V2.3.md), [pendências e integrações](docs/INTEGRACOES-V2.3.md), [formato das importações](docs/IMPORTACOES-V2.3.md) e [arquitetura](docs/ARQUITETURA.md). Os documentos `history-v1`, `history-v2.2` e a evidência V2.2 são históricos.
