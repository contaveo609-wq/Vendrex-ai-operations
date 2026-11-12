"""Explicit, bounded live inference tests. No external publication or message sending.

This is separate from the offline regression suite. It uses the official CLI,
requires current telemetry and preserves the configured 10% usage reserve.
"""
import argparse
import json
from pathlib import Path
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from vendrex.codex import CodexRPC
from vendrex.db import now, safe_error
from vendrex.policy import OfficialUsageProvider
from vendrex.service import Service

parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--agent', choices=['sales','builder','growth','director'])
args = parser.parse_args()
scenarios = {
    'sales': 'Teste controlado, empresa fictícia com pedidos perdidos. Produza duas perguntas sobre dor e impacto. Sem preço, proposta vinculante ou envio. Identifique que consentimento real ainda precisa ser comprovado.',
    'builder': 'Teste controlado. Prepare um plano curto para uma calculadora HTML com quatro operações e testes de divisão por zero e decimais. Não faça deploy nem use rede. Nenhum arquivo é necessário neste teste de interpretação.',
    'growth': 'Teste controlado. Prepare legenda curta e roteiro para Vendrex sobre organização de pedidos. Sem pesquisa de tendências disponível. Não invente pesquisa ou métricas. Informe que OAuth e publicação real ainda precisam de comprovação.',
    'director': 'Teste controlado com telemetria fornecida: worker Growth HTTP 200, publicações reais 0, Sales com gateway Baileys por QR implementado e testes de fila e personalidade aprovados no Supabase, nenhum telefone vinculado e nenhum servidor permanente provisionado; Builder com testes locais aprovados. Avalie prontidão. Não declare Growth ou Sales operacional. Sugira dois próximos passos.',
}
report = json.loads(args.out.read_text(encoding='utf-8')) if args.agent and args.out.exists() else {'at': now(), 'kind': 'LIVE_CLI_INFERENCE_WITH_CONTROLLED_INPUTS', 'external_messages': 0, 'external_publications': 0, 'agents': {}}
args.out.parent.mkdir(parents=True, exist_ok=True)

def save():
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

with tempfile.TemporaryDirectory() as directory:
    service = Service(Path(directory))
    try:
        with CodexRPC() as rpc:
            catalog = rpc.call('model/list', {}).get('data', [])
            windows = OfficialUsageProvider.read(rpc)
        config = service.config
        config['models'] = [{'id': m['id'], 'family': 'luna' if 'luna' in m['id'] else 'astra', 'verified': True,
                            'efforts': [e['reasoningEffort'] for e in m.get('supportedReasoningEfforts', [])]}
                           for m in catalog if m['id'] in {'gpt-6-luna', 'gpt-6-astra'}]
        config['codex_timeout_seconds'] = 90
        for agent in scenarios:
            config['routing'][agent]['model'] = 'gpt-6-luna' if agent in {'sales', 'director'} else 'gpt-6-astra'
        service.db.set('config', config)
        service.guard.record('official', windows, 'Live V2.4 acceptance tests')
        service.control('start')
        for agent, scenario in scenarios.items():
            if args.agent and args.agent != agent:
                continue
            if not service.guard.status()['allowed']:
                raise RuntimeError('Telemetria sem margem: teste interrompido, reserva preservada.')
            task = service.create_task(agent=agent, kind='USER_TASK', description=scenario,
                                       data={'complexity':'simple'}, requires_ai=True, priority=20)
            result = service.run_next()
            if result is None or result['id'] != task:
                raise RuntimeError('Executor não selecionou a tarefa controlada.')
            report['agents'][agent] = {'state': result['state'], 'result': result.get('result'), 'task_id': task,
                                      'audit': service.db.rows('SELECT action,details FROM audit_logs WHERE task_id=? ORDER BY id', (task,))}
            if result['state'] != 'COMPLETED':
                report['agents'][agent]['task'] = result
            save()
            print(agent + ': ' + result['state'], flush=True)
            if result['state'] != 'COMPLETED':
                raise RuntimeError('Inferência não concluída; consulte evidência do agente.')
    except Exception as error:
        report['error'] = safe_error(error)
        save()
        print(report['error'], flush=True)
        sys.exit(2)
if len(report['agents']) == 4 and all(v['state']=='COMPLETED' for v in report['agents'].values()):
    report.pop('error', None)
save()
print('Requested live inference tests completed. Production autonomy remains unverified.', flush=True)
