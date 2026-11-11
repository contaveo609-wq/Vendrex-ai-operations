/* Rendering checks run without network, framework dependencies, or browser claims. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const python = process.env.VENDREX_TEST_PYTHON || (process.platform==='win32'?'python':'python3');
const fixture = cp.execFileSync(python,['-c',[
  'import tempfile,json',
  'from pathlib import Path',
  'from vendrex.service import Service',
  'from run import demo_seed',
  'with tempfile.TemporaryDirectory() as p:',
  ' s=Service(Path(p));demo_seed(s);print(json.dumps(s.snapshot()))',
].join('\n')],{encoding:'utf8'});
const snapshot = JSON.parse(fixture);
snapshot.csrf = 'test-only';
const elements = Object.fromEntries(['app','dialog','toast','dialog-error'].map(id=>[id,{
  innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},
  addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},
}]));
const handlers = {};
const context = vm.createContext({
  console,Intl,Date,JSON,Math,Set,String,Number,Object,Boolean,Array,Error,Promise,
  encodeURIComponent,structuredClone,crypto:{randomUUID:()=> 'test-only'},
  location:{hash:'#overview'},setTimeout:()=>0,clearTimeout(){},setInterval(){},
  document:{getElementById:id=>elements[id],addEventListener:(key,fn)=>{handlers[key]=fn;},activeElement:{tagName:'BODY'}},
  window:{addEventListener(){},scrollTo(){}},
  fetch:async()=>({ok:true,json:async()=>structuredClone(snapshot)}),
});
vm.runInContext(fs.readFileSync('dashboard/app.js','utf8'),context);
async function run(){
  await new Promise(resolve=>setImmediate(resolve));
  let checks=0;
  for(const page of ['overview','sales','builder','growth','director','queue','approvals','settings','audit']){
    vm.runInContext(`page=${JSON.stringify(page)};render();`,context);
    assert.ok(elements.app.innerHTML.includes('<main'));
    assert.ok(!elements.app.innerHTML.includes('undefined'));
    assert.ok(!/\bonclick=/.test(elements.app.innerHTML));
    checks++;
  }
  for(const command of ["taskModal('sales')","taskModal('builder')","leadModal()","saleModal()","researchModal()"]){
    vm.runInContext(command,context);
    assert.ok(elements.dialog.innerHTML.includes('<form'));
    checks++;
  }
  const attack='<img src=x onerror=alert(1)>';
  context.attack=attack;
  assert.equal(vm.runInContext('h(attack)',context),'&lt;img src=x onerror=alert(1)&gt;');
  vm.runInContext("state.records.leads[0].data.name=attack;page='sales';render();",context);
  assert.ok(!elements.app.innerHTML.includes(attack));
  assert.ok(elements.app.innerHTML.includes('&lt;img'));
  checks++;
  vm.runInContext("state.tasks=[];state.notifications=[];state.records.leads=[];state.records.projects=[];state.records.content_items=[];state.reports=[];state.training=[];page='overview';render();",context);
  assert.ok(elements.app.innerHTML.includes('Sua fila está livre'));
  checks++;
  console.log(`${checks} verificações de renderização e escape passaram. Validação visual no navegador permanece separada.`);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
