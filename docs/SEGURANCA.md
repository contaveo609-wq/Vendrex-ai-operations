# Segurança e permissões

Somente loopback. Host, Origin e token CSRF são verificados. Não há CORS aberto, shell HTTP nem upload executável. O painel não deve ser exposto com bind 0.0.0.0 ou encaminhado publicamente. Outro software executado pelo mesmo usuário pode acessar os arquivos locais; esta V1 não é ambiente multiusuário.

Codex usa autenticação ChatGPT oficial, sem OPENAI_API_KEY/CODEX_API_KEY nem fallback pago. Execução desconsidera configurações de usuário e MCPs para não herdar conexões inesperadas. Agentes de texto usam read-only; Builder usa workspace-write no próprio trabalho, sem rede. Solicitações de privilégios não são aprovadas automaticamente e o modo sem sandbox nunca é escolhido. Sandbox não é garantia absoluta contra falhas do sistema operacional e o diagnóstico precisa confirmar seu suporte local.

Dados externos são armazenados como informação não confiável, serializados e escapados na interface. Eles não entram em configurações ou aprovações. Playbooks protegidos são lidos dos arquivos do projeto. Treinamentos aprovados entram como adendos supervisionados, não como instrução superior.

Permissions não configuram canais. TASK_PERMISSION permite somente o escopo indicado e, mesmo aprovado, não cria um adaptador de envio, pagamento ou publicação. Financeiro de exemplo fica bloqueado sem integração. Não existe ação de compra efetiva na V1.

Credenciais ficam no login do Codex; o projeto não implementa cofre de integrações que ainda não existem. Para uma futura conexão Windows, usar Credential Manager ou DPAPI antes de armazenar segredos. Logs mascaram padrões comuns de credencial, e a coleta evita stdout completo de MCPs e não imprime autenticação. Dados comerciais continuam sensíveis: não publique exportações ou bases.

Retenção: o botão Revisar retenção lista IDs de pesquisas e memórias sem atualização há mais de 180 dias. Nenhum dado é excluído antes de aprovação específica. Antes de aplicar o escopo aprovado, cria backup SQLite. Clientes, contratos, projetos, auditoria e backups são preservados. Logs JSONL rotacionam em 1 MB com três arquivos anteriores; SQLite mantém o registro autoritativo completo. Uma interrupção entre gravação de arquivo e cursor pode repetir linhas com o mesmo ID no JSONL, sem perder auditoria no banco.
