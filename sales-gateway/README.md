# Vendrex Sales por QR

O gateway usa Baileys, Supabase e inferência própria com Ollama. Não usa a WhatsApp Business Platform, o agente nativo da Meta, BSP ou API de IA paga. Baileys é um conector não oficial, autorizado pelo proprietário nesta missão; sua disponibilidade não é garantida pela Meta.

## Estado comprovado

O código, a persistência no Postgres e a interface foram testados. Houve geração real com um modelo aberto por um backend autenticado na máquina de teste. Ainda não houve vinculação de um número, conversa real completa ou instalação em servidor permanente. `SALES_WHATSAPP_OPERATIONAL` continua `false`.

A geração local com Gemma 3 1B produziu respostas curtas, mas o cenário comercial ainda exige validação de qualidade: em um teste, o modelo pediu mais detalhes sobre uma rotina já descrita. Gemma 2 2B concluiu uma geração real após falhas iniciais, em aproximadamente 76 segundos, com resposta ainda genérica; ele não foi promovido a padrão. Não há fallback para inferência paga. A seleção de um modelo com qualidade comercial e desempenho adequado continua pendente de validação.

## Componentes

- Sessão e chaves Signal persistidas no Supabase, com AES-256-GCM, chave no Vault e acesso apenas de backend.
- Instância com lease exclusivo, renovação e interrupção quando perde o lease.
- Eventos de conversas individuais, identificação por telefone/LID, histórico, debounce de cinco segundos e deduplicação.
- Fila durável, geração com histórico, IDs estáveis de saída e confirmação separada de aceitação, entrega e leitura.
- Retentativa limitada antes do envio; resultado ambíguo exige reconciliação e não é enviado novamente automaticamente.
- Pausa, transferência humana, opt-out, logs sem conteúdo de conversas e monitoramento por heartbeat.
- Edição de personalidade, instruções, abertura, pedido de permissão e texto-base da proposta. A edição persiste no Supabase e invalida gerações que ainda não iniciaram o envio.

## Instalação em servidor

É necessário um servidor que continue ligado sem o notebook. O pacote foi preparado para Linux com Docker Compose, aproximadamente 2 vCPUs e pelo menos 6 GB de RAM para gateway, modelo e sistema. O desempenho deve ser medido no servidor escolhido. Nenhum servidor foi contratado ou criado.

Uma possibilidade sem mensalidade é uma VM elegível no Oracle Cloud Always Free. A documentação consultada oferece até 2 OCPUs e 12 GB no conjunto gratuito A1, sujeito a capacidade, cotas e recuperação de instâncias ociosas. Criar/autenticar a conta e concluir verificações do provedor exige o titular. Não fazer upgrade pago. [Fonte oficial](https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

1. Clone a branch `upgrade/v2.4` no servidor autorizado.
2. Copie `.env.example` para `.env` em `sales-gateway`. Configure a chave de backend do Supabase e um token administrativo aleatório com pelo menos 32 caracteres. Não use chaves em frontend, Git ou chat.
3. Na pasta `sales-gateway`, execute:

```sh
docker compose up -d ollama
docker compose exec ollama ollama pull gemma3:1b
docker compose up -d --build sales
docker compose logs --tail=50 sales
```

Os serviços usam bibliotecas e modelo próprios, sem cobrança por mensagem. A gratuidade da infraestrutura depende dos recursos e cotas efetivamente disponíveis na conta. O build Docker ainda não foi executado nesta máquina, pois Docker não está instalado.

O painel escuta somente no loopback do servidor. Para administrar de outro computador:

```sh
ssh -N -L 8787:127.0.0.1:8787 usuario@IP_DO_SERVIDOR
```

Abra `http://127.0.0.1:8787`, informe o token administrativo e consulte o estado. O túnel serve apenas à administração; fechar o navegador, o túnel ou a sessão Codex não encerra os containers do servidor.

## Ativação e prova real

1. O titular vincula o QR usando **Aparelhos conectados** no WhatsApp Business. O QR não é registrado nos logs.
2. Cadastre somente o contato de teste autorizado e retome em modo TEST. O servidor precisa ter o modelo instalado e a conexão ativa.
3. O contato envia uma mensagem real. Confira mensagem, contato, histórico, inferência, saída e recibo de entrega no Supabase.
4. Reinicie `sales`, confirme que a sessão persistida reconectou e faça uma segunda interação real no mesmo contato.
5. A instalação permanente precisa ser verificada por evidência externa; a variável `SALES_HOST_KIND` sozinha não prova hospedagem. Só depois dessa verificação, o registro da instância pode receber `permanent_host_verified_at`.
6. A prova automática exige respostas reais entregues/lidas, inferência real, duas inicializações diferentes e servidor verificado. A ativação LIVE é recusada antes disso.

Não confundir testes com eventos controlados ou fixtures SQL com conversa real. Não há contato de teste cadastrado neste projeto.

## Capacidade e limites

O teto inicial é de **500 gerações/dia** e **1.000 processamentos/dia**, configurável no backend. São orçamentos da aplicação, não cotas oficiais de WhatsApp nem garantia contra bloqueios. Por exemplo, 40–50 conversas com seis respostas da IA consomem 240–300 gerações. Outras conversas, retentativas e picos também consomem capacidade.

A configuração começa pausada, somente em TEST e sem prospecção iniciada pelo gateway. `prospect-flow.json` guarda o exemplo de abordagem informado pelo proprietário; pesquisa e primeiro contato permanecem desativados. Número público e permissão do destinatário têm registros distintos. [Política oficial do WhatsApp](https://business.whatsapp.com/policy).

## Testes

```sh
npm ci
npm test
```

Na raiz do repositório:

```sh
node --test tests/test_sales_cloud.mjs
python scripts/verify_sales_browser.py --out CAMINHO_DAS_EVIDENCIAS
node scripts/verify_sales_companion.mjs CAMINHO_DO_RELATORIO.json
```

O último comando usa o Ollama já instalado em `127.0.0.1:11434`, gera texto real e testa autenticação do backend. Ele não envia WhatsApp nem comprova servidor remoto. Os testes SQL em `supabase/tests/sales.sql` e `sales_qr.sql` executam e revertem fixtures no Postgres real.
