"""Bounded event diagnostics: never log request data or exception messages/locals."""
from contextlib import contextmanager
import json
import time
from backend.app.native.runtime_version import VERSION


def emit(stage, status, **values):
    print(json.dumps({'component': 'teacher-worker', 'patch': 'cloudflare-cpu-step4', 'version':VERSION,
                      'stage': stage, 'status': status, **values}), flush=True)


def failure(exc):
    # Exceptions may embed SQL parameters, tokens or submitted text. Keep only
    # types and frame locations, not str(exc), source lines or local variables.
    chain = []
    seen = set()
    while exc is not None and id(exc) not in seen and len(chain) < 3:
        seen.add(id(exc))
        frames = []
        tb = exc.__traceback__
        while tb is not None:
            code = tb.tb_frame.f_code
            frames.append({'file': '/'.join(code.co_filename.replace('\\', '/').split('/')[-3:]),
                           'line': tb.tb_lineno, 'function': code.co_name})
            frames = frames[-12:]
            tb = tb.tb_next
        chain.append({'type': type(exc).__name__, 'frames': frames})
        exc = exc.__cause__ or (None if exc.__suppress_context__ else exc.__context__)
    return chain


@contextmanager
def phase(stage, *, progress=True):
    started = time.monotonic()
    if progress:
        emit(stage, 'START')
    try:
        yield
    except BaseException as exc:
        emit(stage, 'ERROR', elapsed_ms=round((time.monotonic()-started)*1000, 2),
             exceptions=failure(exc))
        raise
    else:
        if progress:
            emit(stage, 'OK', elapsed_ms=round((time.monotonic()-started)*1000, 2))
