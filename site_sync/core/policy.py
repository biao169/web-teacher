"""Small, runtime-independent recovery policy for the redesigned sync module."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Decision:
    outcome: str
    consecutive: int
    delay: int


def recover(before, after, consecutive, *, failed=False, permanent=False,
            fast_retries=30, slow_seconds=900, fast_seconds=10):
    if min(before, after, consecutive, fast_retries) < 0 or slow_seconds < 1:
        raise ValueError('invalid policy')
    if after < before:
        raise ValueError('progress cannot regress within one task')
    # Revocation/conflicts take precedence even if an earlier write succeeded.
    if permanent:
        return Decision('paused', 0 if after > before else consecutive, 0)
    if after > before:
        return Decision('progress_after_error' if failed else 'progress', 0, 0)
    if not failed:
        return Decision('waiting', consecutive, 0)
    count = consecutive + 1
    # Count the initial failed attempt separately from the configured retries.
    if count > fast_retries:
        return Decision('slow_retry', count, min(1800,max(fast_seconds,slow_seconds)))
    return Decision('retry', count, min(1800,max(10,fast_seconds)))


def smaller(current, minimum):
    if minimum < 1 or current < minimum:
        raise ValueError('invalid slice bounds')
    return max(minimum, current // 2)


