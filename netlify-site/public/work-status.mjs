const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const agents={sales:'Sales',builder:'Builder',growth:'Growth',director:'Director'};
const states={PENDING:'Aguardando',COMPLETE:'Concluída',SUPERSEDED:'Substituída',CANCELLED:'Cancelada'};
export function renderWorkStatus(data){
 const active=(data.active_subscriptions||[]).map(agent=>agents[agent]||agent).join(', ')||'nenhuma';
 return '<h3>Fila dos agentes</h3><p>Operador: '+(data.operator_enrolled?'confirmado':'aguardando acesso')+'. Encaminhamento: '+(data.enabled?'habilitado':'desativado')+'. Assinaturas ativas: '+escape(active)+'.</p>'+
  '<p>Um resultado salvo comprova apenas a tarefa descrita. Envio no WhatsApp e publicação social exigem confirmação própria.</p><button type="button" data-work-refresh>Atualizar fila</button>'+
  ((data.jobs||[]).length?(data.jobs||[]).map(job=>'<article class="card"><h4>'+escape(agents[job.agent]||job.agent)+' · '+escape(states[job.state]||job.state)+'</h4><p>'+escape(job.id)+' · '+escape(job.created_at)+'</p><pre>'+escape(job.result==null?'Sem resultado registrado.':JSON.stringify(job.result,null,2))+'</pre></article>').join(''):'<p>Nenhuma tarefa registrada.</p>');
}
