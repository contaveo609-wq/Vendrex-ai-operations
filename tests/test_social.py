from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from vendrex.social import GrowthClient


class GrowthClientTests(unittest.TestCase):
    def setUp(self):
        self.client = GrowthClient('https://controlled.supabase.co', 'sb_publishable_fixture_123456', 'USER_JWT_FIXTURE')

    def test_queue_uses_user_auth_and_remote_confirmed_state(self):
        with patch.object(self.client, 'request', return_value={'state': 'QUEUED'}) as request:
            result = self.client.enqueue('11111111-1111-4111-8111-111111111111', 'https://controlled.supabase.co/image.jpg', 'Teste', slot='18:00')
        self.assertEqual(result['state'], 'QUEUED')
        data = request.call_args.args[2]
        self.assertEqual(data['slot'], '18:00')
        self.assertNotIn('access_token', data)
        self.assertNotIn('state', data)

    def test_invalid_media_and_slot_never_enqueue(self):
        for change in [{'kind': 'SVG'}, {'slot': '20:00'}, {'test_post': 'true'}, {'caption': ''}]:
            args = {'connection_id': '11111111-1111-4111-8111-111111111111', 'media_url': 'https://controlled.supabase.co/x', 'caption': 'Teste', **change}
            with patch.object(self.client, 'request') as request:
                with self.assertRaises(ValueError):
                    self.client.enqueue(**args)
                request.assert_not_called()

    def test_svg_draft_is_never_uploaded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'draft.svg'
            path.write_text('<svg/>', encoding='utf-8')
            with self.assertRaises(ValueError):
                self.client.upload(path)

    def test_client_rejects_secret_key_and_nonofficial_origin(self):
        with self.assertRaises(ValueError):
            GrowthClient('https://controlled.supabase.co', 'sb_secret_fixture', 'token')
        with self.assertRaises(ValueError):
            GrowthClient('https://controlled.supabase.co.evil.invalid', 'sb_publishable_fixture', 'token')
