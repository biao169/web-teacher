"""Shared bounded main-site HTTP capacity; not a change to upload/job limits."""
import os

DEFAULT_TEACHER_CONCURRENCY = 16

def teacher_concurrency():
    """Allow explicit small-host tuning; reject invalid settings before launch."""
    try:
        value = int(os.environ.get('TEACHER_HTTP_CONCURRENCY', str(DEFAULT_TEACHER_CONCURRENCY)))
    except ValueError:
        raise ValueError('TEACHER_HTTP_CONCURRENCY must be an integer from 8 to 32') from None
    if not 8 <= value <= 32:
        raise ValueError('TEACHER_HTTP_CONCURRENCY must be an integer from 8 to 32')
    return value
