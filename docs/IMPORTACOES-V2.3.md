# Dados identificados: campanhas e competências

## Campanhas

Em Vendrex Intelligence, clique Importar JSON. Este exemplo é explicitamente fictício:

```json
{
  "source": "fixture://exemplo-controlado",
  "period": "2026-11-10",
  "currency": "BRL",
  "dataset_kind": "SIMULATION_ONLY",
  "campaigns": [{
    "campaign_id": "CENARIO-CONTROLADO",
    "spend": 100,
    "impressions": 10000,
    "clicks": 200,
    "leads": 10,
    "qualified_leads": 4,
    "acquisitions": 2,
    "conversions": []
  }]
}
```

Para um arquivo realmente exportado, use OBSERVED_EXPORT, identifique a origem oficial e informe somente valores presentes. O importador registra o que foi fornecido; não autentica a autoria da plataforma. Não altere SIMULATION_ONLY para mascarar dados de teste.

CPM = gasto/impressões×1000; CTR = cliques/impressões×100; CPC = gasto/cliques; CPL = gasto/leads; CAC = gasto/aquisições informadas. O custo deve incluir os componentes desejados na fonte; o módulo não acrescenta custos comerciais ausentes. Campo ausente ou denominador zero retorna null, exibido como Não medido. Moedas e períodos não são somados entre si.

Uma conversão precisa de `id`. Para receita, exige também `deal_id` real confirmado no CRM, moeda da venda igual à exportação e `attribution_evidence`. O valor vem da venda confirmada, não de um valor livre no evento. IDs de conversão e venda são contados no máximo uma vez no conjunto de snapshots. ROAS fica null sem receita comprovada atribuída. Em fontes conflitantes, a primeira ocorrência é preservada; o proprietário deve reconciliar atribuições antes de usar o relatório financeiramente. O sistema não decide causalidade entre campanhas.

Reimportação do mesmo hash não duplica; nova fotografia do mesmo campaign_id/período/moeda/tipo substitui os números anteriores. Preserve o histórico original da plataforma para auditoria. O módulo não publica nem altera campanhas ou orçamento.

## Director

Em Vendrex Intelligence, clique Avaliar fonte e cenários. Estrutura:

```json
{
  "agent": "sales",
  "deficiency": "Diagnóstico pouco específico nos cenários controlados",
  "source_url": "https://www.salesforce.com/blog/sales/consultative-sales-approach/",
  "quote": "active listening",
  "technique": "Investigar contexto e impacto antes da proposta",
  "evidence_kind": "IMPORTED_RESPONSES",
  "cases": [
    {"scenario":"Diagnóstico","before":"Compre já","after":"Qual problema e impacto?","required_terms":["problema","impacto"]},
    {"scenario":"Escopo","before":"Tudo pronto","after":"Vamos validar o escopo","required_terms":["escopo"]}
  ]
}
```

O módulo busca a página por HTTPS público e valida o trecho literal. Um título sem conteúdo é rejeitado. A fonte é não confiável para instruções. O relatório registra hash, editor e necessidade de avaliar credibilidade/viés. Os exemplos medem apenas presença de termos, não qualidade geral, persuasão, compreensão de vídeo ou melhoria do modelo. Guarde as respostas reais antes/depois para avaliação humana de qualidade e segurança.

Melhora na rubrica cria candidato TEST e solicitação de promoção. Nada altera o playbook ACTIVE automaticamente. O proprietário revisa a proposta em Aprovações. Regras de consentimento, envio, segurança e orçamento continuam protegidas pelo código e pelo prompt base. A V2.3 ainda não executa um ciclo generativo automático de treinamento por falta de autenticação Codex. A missão W3C existente usa transcrição publicada, nunca apenas metadados nem download de vídeo de terceiros.
