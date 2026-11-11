# Integração oficial Meta — V2.4

## Implementação

O painel Vercel funciona como proxy do backend Supabase Edge Function `growth`. Nenhum segredo Meta ou service_role é enviado ao navegador ou exigido na Vercel. A função usa a credencial de serviço fornecida pelo runtime Supabase. Tokens Meta são cifrados com AES-256-GCM, nonce aleatório e vínculo ao proprietário/conexão. A chave mestra e o segredo do worker ficam no Vault. As tabelas de tokens e estados OAuth não concedem acesso a anon/authenticated.

Facebook Login for Business autoriza Páginas do Facebook e suas contas profissionais Instagram vinculadas. A configuração de login deve incluir as permissões necessárias: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `publish_video`, `read_insights`, `instagram_basic`, `instagram_content_publish` e `instagram_manage_insights`. O acesso efetivamente concedido é conferido. Apenas IDs de Páginas explicitamente permitidos no backend podem ser conectados. Cada conta nova começa pausada.

O estado OAuth dura dez minutos, é armazenado apenas como hash e depende de cookie HttpOnly/Secure/SameSite=Lax. Consumo é atômico e único. O callback troca o código no servidor, obtém token de usuário longo e deriva tokens de Página. Tokens de Página longos podem não ter prazo fixo; revogação e validade continuam monitoradas. Não existe promessa de renovação indefinida de token de usuário Facebook. O backend deriva novamente tokens de Página enquanto o token de usuário ainda é válido e alerta sobre reautorização em até sete dias do vencimento conhecido.

A implantação deste projeto já provisionou `growth_project_url`, `growth_worker_secret` e `growth_encryption_key` no Vault. Em outra implantação, configure a URL do projeto de destino antes de ativar o Cron. A migração reutilizável não inclui um identificador gerado de projeto.

## Configuração que permanece pendente

O proprietário confirmou login pessoal na Meta. Isso não equivale ao OAuth das contas da Vendrex. Ainda não foram obtidos App ID, App Secret, configuração do Facebook Login for Business ou IDs permitidos das Páginas. Não copie senhas, cookies ou tokens de sessões de desenvolvimento. Não envie segredos no chat.

No Vault do projeto dedicado, cadastre pelo fluxo administrativo legítimo:

| Nome | Valor |
|---|---|
| `growth_meta_app_id` | ID do app Meta da Vendrex |
| `growth_meta_app_secret` | Segredo do app, exclusivamente no Vault |
| `growth_meta_config_id` | Configuração do Facebook Login for Business |
| `growth_frontend_origin` | Origem HTTPS exata do painel autorizado, sem barra final |
| `growth_allowed_page_ids` | IDs das Páginas da Vendrex, separados por vírgula |

Cadastre como URI de redirecionamento OAuth válida: `ORIGEM_DO_PAINEL/api/meta/callback`. Configure na Vercel somente `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `PUBLIC_BASE_URL`. A origem deve coincidir com `growth_frontend_origin`. O operador precisa de usuário Supabase Auth válido; nenhum usuário de produção foi criado por suposição de identidade.

Se a Meta exigir consentimento, 2FA, revisão de app, vinculação de conta profissional, autorização de publicação da Página ou verificação empresarial, o titular deve concluir esse passo. Para contas próprias/gerenciadas, confira no app os requisitos de acesso Standard e papéis administrativos antes de solicitar Advanced Access.

## Publicação e agendamento

O Cron Supabase acorda o worker a cada minuto. A fila guarda horários em UTC, escolhidos a partir de 12h ou 18h America/Recife: 15h ou 21h UTC. São consumidos apenas conteúdos efetivamente enfileirados; nenhum post fictício é criado para preencher calendário. Itens iniciais atrasados mais de três horas são marcados MISSED. Um horário por conta e impressão digital única impedem duplicações locais.

Instagram: JPEG usa container de imagem; vídeos MP4 e Reels usam container REELS. O ID é persistido antes de publicar. O container é consultado a cada minuto, até cinco vezes. Facebook: fotos e vídeos usam endpoints oficiais; Reels usam inicialização, upload em `rupload.facebook.com` e conclusão com o mesmo ID. O upload é limitado a origens oficiais configuradas. A Meta continua responsável pela validação final das dimensões, duração, codecs e demais limites do arquivo.

Um HTTP bem-sucedido de criação não significa publicação comprovada. O worker consulta o objeto remoto, sua condição de publicação e o permalink oficial. Evidência, prova da conexão e auditoria são gravadas em uma transação. Retentativas usam espera crescente. Perda de lease ou resultado ambíguo de mutação vira RECONCILIATION_REQUIRED e nunca reenvia cegamente. A automação contínua só pode ser ativada após prova real da conta. Alertas ficam no painel; nenhum canal externo de alerta foi contratado.

O bucket público `growth-media` aceita JPEG/MP4, com escrita restrita à pasta do proprietário e objetos imutáveis. `vendrex.social.GrowthClient` permite enviar um arquivo finalizado e enfileirar a publicação usando sessão Supabase de usuário. A geração editorial local existente não foi transformada em pesquisa de tendências remota contínua. SVG e roteiro não são publicados como JPEG/vídeo pronto.

Métricas disponíveis são consultadas periodicamente; valores ausentes permanecem indisponíveis, sem zeros inventados. O backend não compra anúncios.

## Fontes oficiais consultadas

- [Publicação Instagram](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
- [Tokens longos Facebook](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived)
- [Posts e fotos de Páginas](https://developers.facebook.com/documentation/pages-api/posts)
- [Vídeos de Páginas](https://developers.facebook.com/docs/graph-api/reference/page/videos/)
- [Reels Facebook](https://developers.facebook.com/documentation/video-api/guides/reels-publishing)
- [Instagram Insights](https://developers.facebook.com/documentation/instagram-platform/insights/)
- [Agendamento de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Autenticação oficial Codex](https://developers.openai.com/codex/auth)

Pesquisa realizada com Firecrawl e TinyFish, sem contratar intermediários. Os plugins disponíveis neste chat não se tornam automaticamente conectores dos agentes em produção.
