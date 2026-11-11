# Limitações e testes que não passaram por dependência externa

- **WhatsApp sem API, conforme proprietário:** acesso manual ao WhatsApp Web oficial por QR/código. Esse login não integra o Sales. Não há status verificável da sessão externa, eventos, histórico sincronizado, recibos, reconexão ou desconexão controlados pelo aplicativo. Envio autônomo de produção permanece indisponível. Não foi instalada biblioteca que contorne o WhatsApp.
- **Autonomia condicionada:** controles locais e testes de regras existem; a ativação funcional de um transporte real não existe nesta entrega. Dois booleanos não liberam envio.
- **Inteligência:** Codex oficial retorna401. Não foi corrigido com cookies, cópia de sessão ou API paga. Negociação contextual generativa, programação livre e treinamento generativo continuam AUTH_REQUIRED.
- **Director:** fonte textual Salesforce acessada de verdade; comparação controlada de respostas importadas com rubrica literal. A melhoria da rubrica não prova melhoria real do agente. Candidato versionado, promoção pendente.
- **Growth:** sem conta publicitária ou exportação real fornecida. O dataset de aceitação é SIMULATION_ONLY. Não há prova de CPM/CTR/CAC/ROAS reais nem campanha publicada. O vídeo original V2.2 de32s foi preservado e validado novamente no Chromium; não contém narração humana.
- **Builder:** calculadora e quadro foram construídos por scaffolds determinísticos com testes. Não representam capacidade generativa geral. O quadro guarda dados por origem/navegador; não sincroniza com Supabase e depende de exportação local para backup.
- **Supabase:** limite de duas vagas permanece; açaí não foi excluído, pois a conexão não oferece delete_project e o CLI não está autenticado. Nenhuma migração, RLS, CRUD ou login foi testado em banco Supabase VENDREX real.
- **Vercel:** build local e configuração segura testados. Sem deploy, plano comercial confirmado, domínio ou monitoramento remoto. Hobby é restrito a uso pessoal não comercial.
- **Worker remoto:** preparado, não provisionado; notebook desligado ainda interrompe a operação local. Sem prova de recuperação num host systemd real.
- **Ambientes:** execução testada em Linux/Chromium. Launchers Windows preservados/atualizados, sem validação Windows. Não foram avaliados macOS, acessibilidade completa nem escala multiusuário.

O conjunto de aceitação externa está **incompleto**. Testes unitários e Chromium não são usados para declará-lo aprovado. Consulte `TESTES-V2.3.md`, `INTEGRACOES-V2.3.md` e `STATUS-V2.3.json`.
