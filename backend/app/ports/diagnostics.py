"""Optional request diagnostic context for SQL adapters; no feature imports or I/O."""
import hashlib
from contextlib import contextmanager
from contextvars import ContextVar

current_operation=ContextVar("database_diagnostic",default=None)

@contextmanager
def database(statements):
    """Attach only failing SQL fingerprints to an active diagnostic operation; zero extra queries."""
    try:yield
    except Exception:
        context=current_operation.get()
        if context is not None:
            rows=list(statements)
            context['database']={'statements':len(rows),'queries':[
                {'id':hashlib.sha256(sql.encode()).hexdigest()[:12],'parameters':len(args)} for sql,args in rows[:25]]}
        raise

