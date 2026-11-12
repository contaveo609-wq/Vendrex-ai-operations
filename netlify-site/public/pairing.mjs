const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderPairing(data={},now=Date.now()){
 const state=data.state||'HOST_REQUIRED';
 const image=state==='QR_READY'&&Date.parse(data.expires_at)>now&&/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(data.qr_data_url||'')&&data.qr_data_url.length<=100000?data.qr_data_url:null;
 const descriptions={HOST_REQUIRED:'O servidor do WhatsApp ainda precisa ser instalado e ligado. O site está pronto, mas não há QR disponível.',CONNECTED:'WhatsApp vinculado. O atendimento depende do modo, da IA e dos testes exibidos abaixo.',QR_READY:'No celular, abra WhatsApp Business > Aparelhos conectados > Conectar aparelho e escaneie o QR.',QR_EXPIRED:'O QR expirou. Atualize a conexão para consultar o próximo código.',CONNECTING:'O gateway está conectando. Atualize para acompanhar.',RECONNECTING:'O gateway está reconectando. Atualize para acompanhar.',REAUTH_REQUIRED:'É necessário vincular o WhatsApp novamente no gateway.'};
 return `<h2>Conectar WhatsApp</h2><p>${esc(descriptions[state]||'A conexão precisa de atenção no servidor.')}</p>
 ${image?`<img src="${image}" width="280" height="280" class="pairing-qr" alt="QR temporário para vincular seu WhatsApp Business"><p>QR temporário. Escaneie somente pelo seu WhatsApp Business.</p>`:''}
 ${data.host_kind==='LOCAL_TEST'?'<p>Gateway local de teste. Isso não comprova atendimento 24 horas.</p>':''}
 <button type="button" data-pairing-refresh class="secondary">${image?'Atualizar QR':'Atualizar conexão'}</button>`;
}
