# Relatório de entrega — VENDREX AI Operations V1

Reconstrução em pasta nova, preservando a implementação anterior. O prompt original fornecido pelo proprietário está incluído integralmente. Código versionado em Git. Página privada de entrega separada do dashboard operacional local.

## A. Construído

Quatro perfis e quatro interfaces próprias; orquestrador Python; banco SQLite com migrações; fila com os 12 estados solicitados; eventos; dependências; deduplicação; executor exclusivo; recuperação; aprovações com escopo e validade; scheduler 12h/18h/20h America/Recife; Model Router com catálogo oficial e tetos; provedores de uso; Caveman original; logs JSONL com rotação e auditoria SQLite; notificações locais no painel; backups; exportação de código e dados; retenção supervisionada com backup; treinamento versionado; scripts Windows e suíte de testes.

## B. Verificado

37 testes Python aprovados: núcleo, 14 cenários obrigatórios cobertos por testes de fluxo e isolamento, controles HTTP, downloads reais, CSRF/Host/Origin, travessia de caminhos, backup, retenção, modelo acima do teto, subprocesso do adaptador e timeout. São testes com dados fictícios e sem mensagens externas.

16 verificações JavaScript aprovadas: renderização das nove páginas, cinco formulários, escape de conteúdo malicioso e estado vazio. Sintaxe JavaScript e compilação Python verificadas. Esses checks não substituem QA visual em navegador.

Catálogo `model/list` e login ChatGPT verificados no ambiente disponível. O diagnóstico completo está em `diagnostico-ambiente.json`. O ZIP é validado por integridade e por extração em pasta temporária; o processo extraído responde HTTP e permite baixar seu próprio código.

## C. Configuração pendente

No computador Windows do proprietário: Python 3.11+, Git, Codex oficial com login ChatGPT; diagnóstico local; seleção de modelos; saldo oficial ou observação manual recente. Registro no Agendador Windows só após autorização explícita do usuário no script. TinyFish/Firecrawl e canais externos exigem integração independente da conexão do chat.

## D. Não verificado ou indisponível

Windows 11 não foi executado neste ambiente Linux. Não há ferramenta de controle de navegador oferecida ao agente; QA visual permanece pendente. Uma inferência real via Codex não foi iniciada porque `account/rateLimits/read` retornou HTTP 401. Sem saldo verificável, o software bloqueia IA por padrão. Não afirmar operação comercial autônoma, vídeo final, publicação ou envio externo.

## E. Iniciar no Windows

Extraia o ZIP e abra `Iniciar.cmd` ou, dentro da pasta VENDREX-AI:

```powershell
py -3 .\run.py serve --open
```

## F. Acessar

`http://127.0.0.1:8766`. Esse endereço é local no computador que executa o comando. O painel não foi publicado na internet. A página privada de entrega hospeda somente pacote e instruções.

## G. Testar venda

Abra `Demonstracao.cmd` ou rode `py -3 .\run.py serve --demo --open`. Use a base fictícia para confirmar outra venda, iniciar o sistema e inspecionar briefing, evento e histórico no Builder. A chave do formulário evita repetir o mesmo envio. Contrato não vira recebimento automaticamente.

## H. Interromper

Pausar impede novas execuções. Parada registra bloqueio de novas tarefas, respeitando ponto seguro do trabalho atual. Ctrl+C fecha o servidor depois de finalizar o executor. Reinício durante trabalho exige aprovação de recuperação. Nenhum processo é encerrado abruptamente apenas para abrir espaço ao Social.

## I. Consumo

Consulte Configurações. Há janelas separadas de cinco horas e semanal. Uso oficial ou manual vencido é bloqueado. Saldo de 10% ou menos nunca libera chamada; margem extra restringe saldos próximos. Tokens de execução não equivalem a percentual do plano. Não há garantia exata de reserva durante uma inferência já iniciada.

## J. Próximos passos

Validar Windows e aparência no computador; com saldo confirmado, testar uma chamada curta real; conectar pesquisa e canais oficiais aprovados; ampliar importação de materiais e continuidade segura de projetos Builder. Consulte LIMITACOES.md para detalhes.
