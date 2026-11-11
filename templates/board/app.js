'use strict';
const stages=['A fazer','Em andamento','Concluído'];
function validate(items){
 if(!Array.isArray(items)||items.length>1000)throw new Error('Base local inválida.');
 const ids=new Set();
 for(const item of items){if(typeof item.id!=='string'||ids.has(item.id)||typeof item.title!=='string'||!item.title.trim()||item.title.length>120||!stages.includes(item.stage))throw new Error('Tarefa local inválida.');ids.add(item.id);}
 return items;
}
if(typeof module!=='undefined')module.exports={validate,stages};
if(typeof document!=='undefined'){
 const key='vendrex-board-v1',status=document.getElementById('status');let items=[],storageReadable=true,savedRaw=null;
 try{savedRaw=localStorage.getItem(key);items=validate(JSON.parse(savedRaw||'[]'));}catch(e){storageReadable=false;status.textContent='Não foi possível ler a base local. Exporte ou restaure uma cópia; nenhum dado será sobrescrito.';document.getElementById('new-task').hidden=true;document.getElementById('export').textContent='Exportar dados preservados';}
 function save(next){if(!storageReadable){status.textContent='Base inválida preservada; restaure uma cópia antes de salvar.';return;}try{validate(next);localStorage.setItem(key,JSON.stringify(next));items=next;status.textContent='Salvo neste navegador.';render();}catch(e){status.textContent='Falha ao salvar. Os dados anteriores foram preservados. Exporte uma cópia.';}}
 function render(){const board=document.getElementById('board');board.replaceChildren();for(const stage of stages){const column=document.createElement('section');column.className='column';const title=document.createElement('h2');title.textContent=stage;column.append(title);for(const item of items.filter(i=>i.stage===stage)){const card=document.createElement('article');card.className='card';const text=document.createElement('p');text.textContent=item.title;card.append(text);const select=document.createElement('select');select.setAttribute('aria-label','Etapa: '+item.title);for(const name of stages){const option=document.createElement('option');option.value=name;option.textContent=name;option.selected=name===item.stage;select.append(option);}select.addEventListener('change',()=>save(items.map(i=>i.id===item.id?{...i,stage:select.value}:i)));const remove=document.createElement('button');remove.textContent='Excluir tarefa';remove.addEventListener('click',()=>save(items.filter(i=>i.id!==item.id)));card.append(select,remove);column.append(card);}board.append(column);}}
 document.getElementById('new-task').addEventListener('submit',event=>{event.preventDefault();const title=document.getElementById('title').value.trim();if(!title)return;save([...items,{id:crypto.randomUUID(),title,stage:stages[0]}]);document.getElementById('title').value='';});
 document.getElementById('export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([storageReadable?JSON.stringify(items,null,2):(savedRaw||'Storage read failed; no data recovered.')],{type:storageReadable?'application/json':'text/plain'}));const a=document.createElement('a');a.href=url;a.download=storageReadable?'vendrex-projetos.json':'vendrex-dados-preservados.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});render();
}
