# VENDREX AI OPERATIONS V2.3

Evolução da V2.2 existente (base `0f47d48e41b6a37df6469f0432a7e1ee9fc92fc8`). Quatro perfis, fila persistente e um executor sequencial. O sistema executa ferramentas locais; a inteligência generativa e o atendimento WhatsApp real continuam bloqueados pelas dependências descritas abaixo. Nenhuma integração foi simulada como conectada.

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
| WhatsApp: transporte e autonomia verificável | BLOCKED / NOT_IMPLEMENTED | Proprietário escolheu QR/código sem API; link manual externo não integra o Sales |
| Codex CLI | IMPLEMENTED / AUTH_REQUIRED | Chamada real retornou 401; catálogo não comprova inferência |
| Builder: calculadora e quadro persistente | TESTED | Node, Git e Chromium; geração por scaffold local |
| Growth: vídeo 32s | TESTED | MP4 V2.2 preservado, verificação de duração/reprodução na V2.3 |
| Growth: importação/análise de campanhas | TESTED | Fonte, moeda, período, hash e deduplicação; dataset de aceitação SIMULATION_ONLY |
| Meta Ads/Google Ads | NOT_IMPLEMENTED | Sem conta publicitária conectada ou dados reais recebidos |
| Director: fonte e avaliação estruturada | TESTED | Fonte Salesforce acessada; respostas importadas e rubrica literal; promoção pendente |
| Treinamento/negociação generativa | AUTH_REQUIRED | Sem execução de modelo comprovada |
| Supabase | BLOCKED | Dois projetos gratuitos ativos; nenhuma migração remota aplicada |
| Vercel | IMPLEMENTED / BLOCKED | Control plane compila; plano comercial e publicação não autorizados/validados |
| Worker remoto | IMPLEMENTED / BLOCKED | Units systemd preparadas, sem servidor provisionado ou teste remoto |

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
