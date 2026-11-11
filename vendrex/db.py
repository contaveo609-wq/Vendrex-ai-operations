from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import uuid

ROOT = Path(__file__).resolve().parent.parent
ENTITIES = {'leads', 'clients', 'deals', 'payments', 'projects', 'requirements', 'content_items', 'publications', 'research', 'memory'}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def uid() -> str:
    return uuid.uuid4().hex


def dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def fingerprint(value) -> str:
    return hashlib.sha256(dumps(value).encode()).hexdigest()


def safe_error(value) -> str:
    text = str(value)
    text = re.sub(r'(?i)(bearer\s+|sk-)[\w.\-]+', '[redacted]', text)
    text = re.sub(r'(?i)(token|api_key|password)(["\s:=]+)[^\s,;]+', r'\1\2[redacted]', text)
    return text[-1600:]


class Database:
    def __init__(self, data: Path):
        self.data = Path(data).resolve()
        self.data.mkdir(parents=True, exist_ok=True)
        self.path = self.data / 'vendrex.sqlite3'
        with self.connect() as conn:
            conn.execute('PRAGMA journal_mode=WAL')
            conn.execute('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
            for file in sorted((ROOT / 'memory/migrations').glob('*.sql')):
                version = int(file.name.split('_')[0])
                if not conn.execute('SELECT 1 FROM schema_migrations WHERE version=?', (version,)).fetchone():
                    if self.path.exists() and conn.execute('SELECT COUNT(*) FROM schema_migrations').fetchone()[0]:
                        directory=self.data/'backups';directory.mkdir(exist_ok=True)
                        # Read-only backup precedes each upgrade, including schema alterations.
                        with sqlite3.connect(self.path) as source, sqlite3.connect(directory/('pre-migration-'+str(version)+'-'+uid()[:8]+'.sqlite3')) as target:
                            source.backup(target)
                    # The entire migration and version marker are committed together.
                    script = 'BEGIN IMMEDIATE;\n' + file.read_text() + f"\nINSERT INTO schema_migrations VALUES({version},'{now()}');\nCOMMIT;"
                    conn.executescript(script)

    def connect(self):
        class ClosingConnection(sqlite3.Connection):
            def __exit__(self, *args):
                try: return super().__exit__(*args)
                finally: self.close()
        conn = sqlite3.connect(self.path, timeout=15, factory=ClosingConnection)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('PRAGMA busy_timeout=15000')
        return conn

    @contextmanager
    def transaction(self):
        conn = self.connect()
        try:
            conn.execute('BEGIN IMMEDIATE')
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def rows(self, query, params=()):
        with self.connect() as conn:
            return [dict(row) for row in conn.execute(query, params)]

    def setting(self, key, default=None, conn=None):
        if conn is not None:
            row = conn.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
        else:
            rows = self.rows('SELECT value FROM settings WHERE key=?', (key,))
            row = rows[0] if rows else None
        return json.loads(row['value']) if row else default

    def set(self, key, value, conn=None):
        if conn is not None:
            conn.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, dumps(value)))
        else:
            with self.transaction() as tx:
                self.set(key, value, tx)

    def audit(self, action, details, task_id=None, agent=None, conn=None):
        args = (task_id, agent, action, dumps(details), now())
        if conn is not None:
            conn.execute('INSERT INTO audit_logs(task_id,agent,action,details,created_at) VALUES(?,?,?,?,?)', args)
        else:
            with self.transaction() as tx:
                self.audit(action, details, task_id, agent, tx)

    def record(self, entity, data, project_id=None, record_id=None, conn=None):
        if entity not in ENTITIES:
            raise ValueError('Tipo de registro inválido.')
        record_id = record_id or uid()
        if conn is None:
            with self.transaction() as tx:
                return self.record(entity, data, project_id, record_id, tx)
        conn.execute('INSERT INTO records VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',
                     (record_id, entity, project_id, dumps(data), now(), now()))
        return record_id

    def records(self, entity, project_id=None):
        query, params = 'SELECT * FROM records WHERE entity=?', [entity]
        if project_id is not None:
            query += ' AND project_id=?'
            params.append(project_id)
        result = self.rows(query + ' ORDER BY created_at DESC', params)
        for row in result:
            row['data'] = json.loads(row['data'])
        return result

    def notify(self, title, body, conn=None):
        if conn is None:
            with self.transaction() as tx:
                return self.notify(title, body, tx)
        conn.execute('INSERT INTO notifications VALUES(?,?,?,0,?)', (uid(), title, body, now()))

    def backup(self):
        directory = self.data / 'backups'
        directory.mkdir(exist_ok=True)
        target = directory / ('vendrex-' + datetime.now().strftime('%Y%m%d-%H%M%S-') + uid()[:6] + '.sqlite3')
        with self.connect() as source, sqlite3.connect(target) as destination:
            source.backup(destination)
        self.audit('BACKUP_CREATED', {'file': target.name})
        return target

    def write_journal(self):
        """Export committed audit rows to rotating JSONL; SQLite remains authoritative."""
        directory = self.data/'logs'
        directory.mkdir(exist_ok=True)
        target = directory/'operations.jsonl'
        with self.transaction() as conn:
            last = self.setting('journal_cursor',0,conn)
            rows = conn.execute('SELECT * FROM audit_logs WHERE id>? ORDER BY id LIMIT 500',(last,)).fetchall()
            for row in rows:
                if target.exists() and target.stat().st_size>=1_000_000:
                    oldest = directory/'operations.jsonl.3'
                    if oldest.exists(): oldest.unlink()
                    for number in [2,1]:
                        file = directory/f'operations.jsonl.{number}'
                        if file.exists(): file.replace(directory/f'operations.jsonl.{number+1}')
                    target.replace(directory/'operations.jsonl.1')
                with target.open('a',encoding='utf-8') as stream:
                    stream.write(dumps(dict(row))+'\n')
                last = row['id']
            self.set('journal_cursor',last,conn)
        return len(rows)


class ExecutorLock:
    """OS lock shared by the dashboard and scheduled CLI processes, also on Windows."""
    def __init__(self, data):
        self.path = Path(data) / 'executor.lock'
        self.file = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.file = self.path.open('a+b')
        try:
            if __import__('os').name == 'nt':
                import msvcrt
                if self.path.stat().st_size == 0:
                    self.file.write(b'0')
                    self.file.flush()
                self.file.seek(0)
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (OSError, IOError):
            self.file.close()
            self.file = None
            raise RuntimeError('Outro executor VENDREX já está ativo nesta pasta de dados.')
        return self

    def __exit__(self, *_):
        if self.file:
            self.file.close()
