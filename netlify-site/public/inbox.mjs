const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const when=value=>{
 if(!value)return '—';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Recife',dateStyle:'short',timeStyle:'short'}).format(date);
};

export function renderConversations(data={},selectedId){
 const items=data.conversations||[];
 return `<div class="row"><div><p class="eyebrow">MENSAGENS REAIS · SUPABASE</p><h2>Caixa de entrada do Sales</h2></div><button class="secondary" data-inbox-refresh>Atualizar mensagens</button></div>
 <p>Conversas mais recentes. As respostas automáticas só aparecem após confirmação do WhatsApp. O controle humano interrompe respostas pendentes.</p>
 <div class="inbox-layout"><div class="inbox-list" aria-label="Conversas">${items.map(c=>`<button class="conversation-item ${c.id===selectedId?'selected':''}" data-conversation="${esc(c.id)}" aria-current="${c.id===selectedId?'true':'false'}"><strong>${esc(c.contact?.display_name||c.contact?.identity||'Contato')}</strong><small>${esc(c.contact?.identity||'Identidade indisponível')} · ${esc(when(c.last_inbound_at))}</small><span>${esc(c.contact?.human_takeover?'Atendimento humano':c.contact?.opted_out?'Opt-out':c.status)}</span></button>`).join('')||'<p class="empty-state">Nenhuma conversa real recebida até agora.</p>'}</div><div id="inbox-thread" class="inbox-thread" aria-live="polite">${items.length?'<p>Selecione uma conversa para ver o histórico.</p>':'<p>O histórico aparecerá aqui quando uma mensagem real chegar ao número conectado.</p>'}</div></div>`;
}

export function renderHistory(messages=[],conversation){
 if(!conversation)return '<p>Selecione uma conversa.</p>';
 const c=conversation.contact||{};
 return `<div class="row"><div><h3>${esc(c.display_name||c.identity||'Contato')}</h3><p>${esc(c.identity||'Identidade indisponível')} · ${esc(conversation.status)}</p></div></div>
 <p>Contato: ${c.opted_out?'opt-out registrado':'sem opt-out'} · ${c.blocked?'bloqueado':'não bloqueado'} · ${c.human_takeover?'atendimento humano':'automação permitida pela configuração'}</p>
 <div class="actions"><button data-human-control="${c.human_takeover?'resume_conversation':'human'}" data-conversation-id="${esc(conversation.id)}" ${c.opted_out||c.blocked?'disabled':''}>${c.human_takeover?'Retomar automação desta conversa':'Transferir para humano'}</button></div>
 <div class="message-list">${messages.map(m=>`<article class="message ${m.direction==='IN'?'incoming':'outgoing'}"><span class="badge">${esc(m.direction==='IN'?'Cliente':m.direction==='HUMAN'?'Humano':'Sales')}</span><span class="message-time">${esc(when(m.platform_at))}</span><p>${esc(m.body)}</p><small>${esc(m.delivery_state||'Sem confirmação de entrega')}</small></article>`).join('')||'<p>Nenhuma mensagem registrada nesta conversa.</p>'}</div>`;
}
