from datetime import datetime, timezone
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from .db import now


def recife():
    try: return ZoneInfo('America/Recife')
    except ZoneInfoNotFoundError:
        # Recife has a fixed UTC-03 offset and no current daylight-saving transition.
        from datetime import timedelta
        return timezone(timedelta(hours=-3),'America/Recife')


def validate_schedules(schedules):
    expected = {'GROWTH_MIDDAY','GROWTH_EVENING','DIRECTOR_DAILY_REVIEW'}
    if set(schedules)!=expected or any(not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',v) for v in schedules.values()):
        raise ValueError('Horários inválidos. Use HH:MM para as três rotinas.')


class Scheduler:
    def __init__(self, service): self.service = service

    def tick(self, at=None):
        local = (at or datetime.now(timezone.utc)).astimezone(recife())
        config = self.service.config
        created = []
        for event, clock in config['schedules'].items():
            hour,minute = map(int,clock.split(':'))
            due = local.replace(hour=hour,minute=minute,second=0,microsecond=0)
            if local<due: continue
            key = local.date().isoformat()+':'+event
            age = (local-due).total_seconds()/3600
            with self.service.db.transaction() as conn:
                if conn.execute('SELECT 1 FROM schedule_runs WHERE key=?',(key,)).fetchone(): continue
                missed = age>config['catch_up_hours']
                conn.execute('INSERT INTO schedule_runs VALUES(?,?,?,?)',(key,event,'MISSED' if missed else 'QUEUED',now()))
                if missed:
                    self.service.db.audit('SCHEDULE_MISSED',{'key':key,'age_hours':round(age,2)},conn=conn)
                    continue
                task_id = self.service.event(event,{},key,conn)
                created.append(task_id)
        return created
