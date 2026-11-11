"""Sourced campaign snapshots. Imports are evidence, never an ad-platform connection."""
from decimal import Decimal, InvalidOperation
import math
from .db import dumps, fingerprint, now, uid


def number(value):
    if isinstance(value,bool):raise ValueError('Métrica booleana inválida.')
    try: result=Decimal(str(value))
    except InvalidOperation: raise ValueError('Métrica não numérica.')
    if not result.is_finite() or result<0:raise ValueError('Métrica deve ser finita e não negativa.')
    return float(result)


class Campaigns:
    def __init__(self,service):self.service=service;self.db=service.db

    def ingest(self,data):
        if data.get('dataset_kind') not in {'OBSERVED_EXPORT','SIMULATION_ONLY'}:raise ValueError('Identifique exportação observada ou cenário de teste.')
        if not data.get('source') or not data.get('period') or not data.get('currency'):raise ValueError('Informe fonte, período e moeda.')
        if len(dumps(data))>80000:raise ValueError('Importação excedida.')
        rows=data.get('campaigns')
        if not isinstance(rows,list) or not 1<=len(rows)<=100:raise ValueError('Use de 1 a 100 campanhas.')
        seen=set()
        for row in rows:
            key=str(row.get('campaign_id',''))
            if not key or key in seen:raise ValueError('ID de campanha vazio ou duplicado.')
            seen.add(key)
            for field in ['spend','impressions','clicks','leads','qualified_leads','acquisitions']:
                if field in row:row[field]=number(row[field])
            for event in row.get('conversions',[]):
                if not event.get('id'):raise ValueError('Conversão precisa de ID para deduplicação.')
        digest=fingerprint(data)
        with self.db.transaction() as conn:
            old=conn.execute('SELECT id FROM campaign_imports WHERE source_sha256=?',(digest,)).fetchone()
            if old:return {'id':old['id'],'duplicate':True,'state':'TESTED','integration':'NOT_IMPLEMENTED'}
            item=uid()
            conn.execute('INSERT INTO campaign_imports VALUES(?,?,?,?,?,?)',(item,data['source'],digest,data['dataset_kind'],dumps(data),now()))
            self.db.audit('CAMPAIGN_EXPORT_IMPORTED',{'id':item,'source_sha256':digest,'kind':data['dataset_kind']},conn=conn)
        return {'id':item,'duplicate':False,'state':'TESTED','integration':'NOT_IMPLEMENTED'}

    def summary(self):
        import json
        snapshots={}
        for record in self.db.rows('SELECT rowid,* FROM campaign_imports ORDER BY rowid'):
            data=json.loads(record['payload'])
            for row in data['campaigns']:
                # Replacement snapshots never add the same period's spend twice.
                key=(data['dataset_kind'],data['currency'],data['period'],row['campaign_id'])
                snapshots[key]=(data,row,record)
        result=[];conversions={};attributed_deals=set();deals={r['id']:r['data'] for r in self.db.records('deals')}
        for key,(data,row,record) in snapshots.items():
            metrics={}
            for name,numerator,denominator,factor in [('CPM','spend','impressions',1000),('CTR','clicks','impressions',100),('CPC','spend','clicks',1),('CPL','spend','leads',1),('CAC','spend','acquisitions',1)]:
                metrics[name]=round(row[numerator]/row[denominator]*factor,6) if numerator in row and row.get(denominator,0)>0 else None
            revenue=0;count=0;unverified=0
            for event in row.get('conversions',[]):
                event_key=(data['dataset_kind'],event['id'])
                if event_key in conversions:continue
                conversions[event_key]=key
                deal=deals.get(event.get('deal_id'))
                deal_key=(data['dataset_kind'],event.get('deal_id'))
                if deal_key in attributed_deals:continue
                if deal and deal.get('status')=='CONFIRMED' and deal.get('currency')==data['currency'] and event.get('attribution_evidence') and data['dataset_kind']=='OBSERVED_EXPORT':
                    revenue+=number(deal['amount']);count+=1;attributed_deals.add(deal_key)
                else:unverified+=1
            metrics['ROAS']=round(revenue/row['spend'],6) if count and row.get('spend',0)>0 else None
            result.append({'campaign_id':key[3],'period':key[2],'currency':key[1],'dataset_kind':key[0],
                           'source':data['source'],'source_sha256':record['source_sha256'],'observed_metrics':row,
                           'calculated_metrics':metrics,'confirmed_attributed_conversions':count,'confirmed_attributed_revenue':revenue if count else None,'unverified_conversions':unverified})
        return {'state':'TESTED','ad_platform_connection':'NOT_IMPLEMENTED','campaigns':result,
                'note':'Métricas calculadas sobre exportações identificadas. Autoria/atribuição dependem da fonte; nenhum anúncio publicado.'}
