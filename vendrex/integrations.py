from dataclasses import dataclass
from typing import Any

STATES = {'CONNECTED','NOT_CONFIGURED','AUTH_REQUIRED','UNAVAILABLE','ERROR','SIMULATION_ONLY'}


class IntegrationUnavailable(RuntimeError): pass


@dataclass
class ManualImportAdapter:
    """Working manual fallback; it makes no unsupported external API calls."""
    name: str
    service: Any

    def check(self):
        rows = self.service.db.rows('SELECT * FROM integrations WHERE id=?',(self.name,))
        return rows[0] if rows else {'state':'UNAVAILABLE','detail':'Integração desconhecida.'}

    def capabilities(self):
        return {'external_execution':False,'manual_import':True,'input_max_chars':24000,'test_mode':'isolated_records'}

    def execute(self, operation, data):
        if operation!='import_research':
            raise IntegrationUnavailable(f'{self.name}: execução externa não configurada. Nenhum endpoint foi presumido.')
        result = self.service.add_record('research',{**data,'integration_source':self.name,'import_method':'manual'})
        self.service.db.audit('MANUAL_IMPORT',{'adapter':self.name,'record_id':result})
        return result
