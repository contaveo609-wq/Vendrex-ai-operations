import {esc} from './integrations.mjs';
const fields=[['personality','Personalidade',1200],['instructions','Instruções de atendimento',2000],['opening','Abertura',1200],['permission','Pedido de permissão',1200],['proposal','Texto-base da proposta',1200]];
export function renderSales(status={},data={}){
 const b=data.behavior||{},disabled=status.error?'disabled':'';
 return `<div class="row"><div><p class="eyebrow">WHATSAPP · IA PRÓPRIA</p><h2>Vendrex Sales</h2></div><button data-sales-refresh class="secondary">Atualizar estado</button></div>
 <article class="card"><span class="badge">${esc(status.state||'AUTH_REQUIRED')}</span><p>${status.SALES_WHATSAPP_OPERATIONAL?'Conversa real, entrega e continuidade comprovadas.':'Conversa real completa e funcionamento contínuo ainda não comprovados.'}</p>
 ${status.error?`<p role="alert">${esc(status.error)}</p>`:''}<p>Modo: ${esc(status.mode||'TEST')} · Automação: ${status.paused!==false?'pausada':'ativa'} · Debounce: 5 segundos.</p>
 <p>IA: ${esc(status.inference_provider||'—')} · ${esc(status.inference_model||'—')} · ${status.inference_configured?'chave configurada':'chave pendente'}. Teto da aplicação: ${esc(status.inference_daily_limit??'—')} gerações/dia; isso não representa uma cota oficial de WhatsApp.</p>
 <div class="actions"><button data-sales-control="pause" ${disabled}>Pausar Sales</button><button data-sales-control="resume_test" ${disabled||status.state!=='CONNECTED'||!status.inference_configured?'disabled':''}>Atender contato de teste</button><button data-sales-control="activate_live" ${disabled||!status.SALES_WHATSAPP_OPERATIONAL?'disabled':''}>Ativar atendimento geral</button></div></article>
 <form id="sales-contacts-form"><h3>Contato autorizado para teste</h3><label>Números internacionais sem + ou JIDs exatos, separados por vírgula<input name="recipients" value="${esc((status.test_recipients||[]).join(', '))}" required ${disabled}></label><button type="submit" ${disabled}>Salvar contatos de teste</button></form>
 <form id="sales-inference-key-form" autocomplete="off"><h3>Chave da IA gratuita</h3><p>Crie uma chave no <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Groq Free</a> e cole aqui. Ela será guardada no Vault do Supabase. Salvar pausa o Sales para novo teste. Mantenha a conta no plano Free.</p><label>Chave Groq<input type="password" name="api_key" pattern="gsk_[A-Za-z0-9_-]{32,200}" maxlength="204" autocomplete="off" required></label><button type="submit">Salvar chave com segurança</button></form>
 <form id="sales-behavior-form"><h3>Personalidade e falas</h3><p>Edite o estilo e os textos de referência usados pela IA nas próximas respostas.</p>
 ${fields.map(([key,label,max])=>`<label for="sales-${key}">${label}</label><textarea id="sales-${key}" name="${key}" rows="3" maxlength="${max}" required ${disabled}>${esc(b[key]||'')}</textarea>`).join('')}
 <button type="submit" ${disabled}>Salvar personalidade e falas</button><p>Configuração: versão ${esc(data.behavior_revision??'—')}.</p></form>
 <p>A conexão por QR exige o gateway instalado no servidor permanente. Publicar o painel não inicia esse servidor.</p>`;
}
