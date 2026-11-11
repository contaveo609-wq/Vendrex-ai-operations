# VENDREX AI Operations V2.2

Sales, Builder, Growth e Director com fila sequencial, contexto compartilhado e quatro missões locais executadas com arquivos reais. Usa o pacote V2.2 fornecido pelo proprietário, preservado em `docs/v2.2-input/`.

## O que foi comprovado

- **Sales:** acessou fontes públicas e cadastrou duas empresas reais com URL, data, evidência e qualificação. Nenhuma mensagem enviada; prospecção não equivale a consentimento.
- **Builder:** gerou uma calculadora executável, criou branch/commit e passou em 17 testes de aritmética. Chromium validou mouse, teclado, decimais, divisão por zero, recuperação e tela móvel. A aplicação gerada está em `examples/calculator/`.
- **Growth:** renderizou dois MP4 verticais de **32,000 segundos**, H.264, 1080×1920 e trilha instrumental sintetizada original. O segundo incorporou o treinamento. Não há narração humana nem vídeo de terceiros.
- **Director:** leu a transcrição pública de um vídeo da W3C, enviou uma aula interna ao Growth e criou versão experimental do playbook. O Growth confirmou recebimento, aplicou a técnica e passou na comparação. A promoção do adendo para produção continua sujeita à aprovação humana.

As missões usam ferramentas locais reais e rotinas determinísticas. Elas **não comprovam inferência com o Codex CLI nem autonomia generativa para qualquer tarefa**. Uma chamada real ao CLI foi tentada e retornou 401; o estado correto é AUTH_REQUIRED. Não foi usada API de IA paga.

## Abrir no Windows

Requisitos básicos: Python 3.11+ e Git. Para missões: Node.js, FFmpeg/ffprobe e Pillow.

```powershell
py -3 -m pip install -r .\requirements-media.txt
py -3 .\run.py serve --open
```

Ou abra **Iniciar.cmd**. O painel é `http://127.0.0.1:8766`. Começa pausado. Na página **Missões**, execute a suíte e depois **Iniciar sistema**. Arquivos e histórico ficam disponíveis na tarefa de cada agente.

Para executar a suíte direto e salvar em uma base isolada:

```powershell
py -3 .\run.py missions --data .\runtime-missions
```

Ou abra **Missoes.cmd**. O processo retorna código zero somente se as quatro missões e o experimento de aplicação forem concluídos. Confirme `ffmpeg -version`, `ffprobe -version`, `git --version` e `node --version` antes de executar.

**Demonstracao.cmd** continua usando dados explicitamente fictícios em `runtime-demo`; não os confunda com o resultado real da prospecção. Para inspecionar a suíte executada localmente: `py -3 .\run.py serve --data .\runtime-missions --open`.

## Testes

```powershell
py -3 -m unittest discover -s tests -v
node .\tests\test_dashboard.cjs
node .\examples\calculator\test.cjs
```

Resultado desta entrega: **55 testes Python**, **17 testes da calculadora**, **16 checks de renderização** e **18 verificações reais em Chromium**. A evidência do navegador está em `docs/evidence/browser-verification.json`. Windows ainda precisa ser validado no computador do proprietário; estes resultados foram obtidos em Linux.

## Nuvem e integrações: estado real

O Supabase informou US$0/mês, mas recusou criar o projeto dedicado porque a conta já tem dois projetos gratuitos ativos. Nenhum banco de cliente foi alterado. Há migração com RLS, sincronização autenticada e control plane em `cloud/`, mas não são apresentados como conexão testada. Vercel não foi implantado em produção: ainda exige projeto de dados, plano comercial elegível e aprovação de produção. Nenhum executor remoto permanente foi inventado.

O motor de atendimento implementa elegibilidade, consentimento, debounce de 3–10s, revisão por nova mensagem, opt-out, transferência humana e idempotência. Seus testes são isolados. **WhatsApp continua bloqueado** sem conector permitido, contatos controlados e ativação validada. Não há QR fictício, automação não oficial anunciada como oficial ou resposta a contatos pessoais.

## Segurança e operação

Um executor por pasta de dados; fila persistente; backups; aprovações com escopo; pastas por trabalho; Caveman original; contexto VENDREX versionado; fontes externas não alteram permissões. Os quatro pilares e a referência histórica de R$1.490,90 foram corrigidos. O ticket é referência, não preço fixo.

Pausar impede novas tarefas. Parada registra bloqueio; a tarefa atual termina em ponto seguro. Ctrl+C encerra o servidor depois do trabalho atual. Trabalhos interrompidos pedem revisão. O agendador Windows só é registrado após autorização no script.

Relatório: [docs/ENTREGA.md](docs/ENTREGA.md). Limitações: [docs/LIMITACOES.md](docs/LIMITACOES.md). Resultados: [docs/MISSOES-VERIFICADAS.json](docs/MISSOES-VERIFICADAS.json). A documentação V1 está identificada em `docs/history-v1/`.
