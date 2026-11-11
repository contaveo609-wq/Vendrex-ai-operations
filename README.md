# VENDREX AI Operations V1

Aplicativo local para Windows 11 com quatro espaços de trabalho: **Sales, Builder, Social e Director**. Python 3.11+, SQLite e HTML/CSS/JavaScript. Um único executor de IA, com fila persistente e supervisão humana. Não exige Docker, WSL, nuvem, API paga ou dependências de frontend.

## Instalar e abrir no Windows

1. Baixe o ZIP da página privada de entrega e extraia a pasta `VENDREX-AI` para seu computador, por exemplo `C:\Projetos\VENDREX-AI`.
2. Abra **Iniciar.cmd** com dois cliques.
3. Acesse **http://127.0.0.1:8766**. O navegador abre automaticamente.
4. O painel começa pausado. Clique **Iniciar sistema** para processar a fila.

Se Python não for encontrado, instale Python 3.11 ou superior pelo site oficial, com o launcher `py`. Git é necessário para os briefings do Builder. Node.js é necessário para a instalação npm do Codex e os testes de frontend.

Comandos equivalentes no PowerShell, dentro da pasta extraída:

```powershell
py -3 .\run.py serve --open
```

Sem IA configurada, já funcionam cadastro e qualificação por regras, rascunhos comerciais, confirmação de vendas, briefings, pacotes editoriais locais, relatórios, fila, agenda, aprovações, treinamento, backup e exportação.

## Testar sem confundir dados reais

Abra **Demonstracao.cmd**. A base `runtime-demo` contém dados explicitamente fictícios e fica separada de `runtime`.

```powershell
py -3 .\run.py serve --demo --open
```

Se já houver um servidor na porta 8766, encerre-o com Ctrl+C ou use `--port 8767`.

## Habilitar Codex

Use o CLI oficial e sua autenticação ChatGPT já contratada. Não coloque tokens ou senhas em arquivos do projeto.

```powershell
codex --version
codex login
codex login status
py -3 .\run.py diagnose
```

Em **Configurações**, execute diagnóstico, escolha IDs do catálogo oficial e registre o saldo observado se a leitura oficial não funcionar. O catálogo e o login detectados no ambiente de desenvolvimento não se transferem para o seu computador. Nenhum modelo é selecionado silenciosamente. Saldo desconhecido ou sem margem bloqueia chamadas. Consulte [Uso e modelos](docs/USO-E-MODELOS.md).

## Comandos úteis

```powershell
py -3 .\run.py status
py -3 .\run.py backup
py -3 .\run.py test-sale --demo
py -3 -m unittest discover -s tests -v
node --check .\dashboard\app.js
node .\tests\test_dashboard.cjs
```

O botão **Código fonte**, no painel, baixa outro ZIP completo do projeto. **Exportar registros** salva dados operacionais em JSON. **Backup SQLite** gera uma cópia consistente do banco.

## Interromper

**Pausar** impede novas execuções. **Parada** também bloqueia novas tarefas e registra o pedido. O trabalho atual termina em ponto seguro. **Ctrl+C** fecha o servidor depois que o executor termina. Um processo travado tem timeout configurado; após interrupção, a recuperação pede revisão antes de repetir o trabalho.

## Estado real desta entrega

Código e fluxos locais testados em Linux. Windows 11 e revisão visual no navegador precisam ser validados no computador do proprietário. O adaptador real do Codex está implementado; uma inferência real não foi iniciada porque o endpoint oficial de uso retornou HTTP 401 no ambiente disponível. Isso está registrado, não disfarçado como integração concluída.

TinyFish, Firecrawl, comunicação, redes sociais, GitHub remoto e deploy permanecem **não configurados no aplicativo local**. Pesquisas podem ser importadas e materiais podem ser publicados manualmente. O app não envia mensagens nem publica conteúdo automaticamente.

Manuais: [Operação](docs/OPERACAO.md), [Arquitetura](docs/ARQUITETURA.md), [Segurança](docs/SEGURANCA.md), [Limitações](docs/LIMITACOES.md), [Relatório de entrega](docs/ENTREGA.md). O prompt original está preservado em `docs/PROMPT-ORIGINAL.txt`.
