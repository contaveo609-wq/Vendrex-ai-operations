# Worker remoto preparado, não instalado

Um servidor Linux persistente, autorizado pelo proprietário, pode executar o timer e o serviço deste diretório. O dashboard continua somente em loopback; acesso remoto exige túnel autenticado ou proxy com autenticação. Não abra a porta local na internet.

1. Provisione o servidor somente após aprovação de fornecedor e custo. Instale Python 3.11+, Node, Git, FFmpeg, Pillow e Codex oficial quando autorizado.
2. Instale o código em `/opt/vendrex`, usuário sem privilégios `vendrex`, diretórios de dados `/var/lib/vendrex` e configuração `/etc/vendrex/worker.env` (0600).
3. Faça login oficial do Codex no próprio executor confiável. Não copie sessões do notebook. `CODEX_HOME` pode apontar para um diretório persistente dentro de `/var/lib/vendrex`; não armazene credenciais em Git ou ZIP. Verifique modelos, telemetria e uma tarefa generativa real antes de liberar IA.
4. Instale as units em `/etc/systemd/system/`. Revise permissões e execute `systemctl enable --now vendrex-worker.timer` somente no servidor autorizado.
5. Consulte `journalctl -u vendrex-worker.service`; faça backup criptografado do diretório persistente e monitore falhas e volume em disco.

O worker chama o agendador existente em America/Recife. As rotinas persistem deduplicação, dependências e recuperação em SQLite. Uma execução por vez usa lock de sistema; o timer não sobrepõe workers. Growth às 12h e 18h e Director às 20h dependem de timer/servidor ativos. Vercel Functions não mantém esse processo.

Estado: IMPLEMENTED (units revisáveis), BLOCKED (sem servidor provisionado/login oficial). Sistema operacional das units não foi validado em host systemd real. SQLite local e Supabase não são filas independentes para a mesma tarefa: a fila Supabase preparada não está ligada ao worker. Multiworker exige um único backend de claim e validação de lease; não ligue ambos para executar a mesma tarefa.
