"""Official auth/catalog/inference probe; no API fallback or credential export."""
from pathlib import Path
import argparse,json,sys,tempfile
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from vendrex.codex import CodexRPC,CodexAdapter
from vendrex.db import safe_error,now
p=argparse.ArgumentParser();p.add_argument('--execute',action='store_true');p.add_argument('--out',type=Path);args=p.parse_args()
report={'at':now(),'state':'AUTH_REQUIRED','execution':'NOT_IMPLEMENTED','model_catalog_only':True}
try:
 with CodexRPC() as rpc:
  report['models']=[{'id':m['id'],'efforts':[e['reasoningEffort'] for e in m.get('supportedReasoningEfforts',[])]} for m in rpc.call('model/list',{}).get('data',[])]
  rpc.call('account/rateLimits/read',{})
  report['authenticated_telemetry']='TESTED'
 if args.execute:
  preferred=next((m for m in report['models'] if m['id']=='gpt-6-luna' and 'xhigh' in m['efforts']),None)
  if not preferred:raise RuntimeError('Preferred model/effort unavailable; no silent downgrade.')
  with tempfile.TemporaryDirectory() as directory:
   result,usage=CodexAdapter().run(Path(directory),'Return a brief authentication check. Do not read files or call tools.',preferred['id'],'xhigh',timeout=60)
  report.update(state='CONNECTED',execution='TESTED',model=preferred['id'],effort='xhigh',result=result,usage=usage,model_catalog_only=False)
 else:report.update(state='TESTED',execution='NOT_IMPLEMENTED')
except Exception as e:report['error']=safe_error(e);report['remedy']='Run codex login or codex login --device-auth on the authorized executor, then repeat this probe. Never export auth files or cookies.'
if args.out:args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(0 if report['state'] in {'CONNECTED','TESTED'} else 2)
