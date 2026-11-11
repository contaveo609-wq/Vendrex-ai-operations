"""Bridge from the local Growth agent to the authenticated remote publication queue.

Only Supabase user credentials are used locally. Meta credentials stay in the backend.
"""
import hashlib
import json
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, build_opener
from .cloud_sync import SupabaseStore, NoCredentialRedirect


class GrowthClient(SupabaseStore):
    def status(self):
        return self.request('/functions/v1/growth/status')

    def enqueue(self, connection_id, media_url, caption, kind='IMAGE', slot='next', test_post=False):
        if not re.fullmatch(r'[a-fA-F0-9-]{36}', connection_id):
            raise ValueError('Identificador de conexão inválido.')
        if kind not in {'IMAGE', 'VIDEO', 'REEL'} or slot not in {'next', '12:00', '18:00'}:
            raise ValueError('Formato ou horário não suportado.')
        if not isinstance(test_post, bool) or not isinstance(caption, str) or not 1 <= len(caption.strip()) <= 2200:
            raise ValueError('Legenda ou tipo de teste inválido.')
        return self.request('/functions/v1/growth/enqueue', 'POST', {
            'connection_id': connection_id, 'media_url': media_url, 'caption': caption,
            'kind': kind, 'mime_type': 'image/jpeg' if kind == 'IMAGE' else 'video/mp4',
            'slot': slot, 'test_post': test_post,
        })

    def upload(self, source):
        file = Path(source)
        mime = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4'}.get(file.suffix.lower())
        if not mime:
            raise ValueError('Publique apenas JPEG ou MP4 finalizado. SVG é rascunho.')
        maximum = 8_000_000 if mime == 'image/jpeg' else 100_000_000
        if not file.is_file() or not 0 < file.stat().st_size <= maximum:
            raise ValueError('Arquivo ausente, vazio ou acima do limite do cliente.')
        owner = self.current_user()['id']
        if not re.fullmatch(r'[a-fA-F0-9-]{36}', owner):
            raise ValueError('Sessão inválida.')
        content = file.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        object_name = owner + '/' + digest + ('.jpg' if mime == 'image/jpeg' else '.mp4')
        encoded = quote(object_name, safe='/')
        req = Request(self.url + '/storage/v1/object/growth-media/' + encoded, method='POST', data=content,
                      headers={'apikey': self.key, 'Authorization': 'Bearer ' + self.token, 'Content-Type': mime})
        try:
            with build_opener(NoCredentialRedirect()).open(req, timeout=45) as result:
                result.read(4096)
        except HTTPError as error:
            # Content-addressed objects are immutable. Reuse a prior identical upload only.
            if error.code != 409:
                raise RuntimeError(f'Storage HTTP {error.code}; upload não confirmado.') from None
        return self.url + '/storage/v1/object/public/growth-media/' + encoded

    def publish_asset(self, connection_id, source, caption, kind='IMAGE', slot='next', test_post=False):
        return self.enqueue(connection_id, self.upload(source), caption, kind, slot, test_post)
