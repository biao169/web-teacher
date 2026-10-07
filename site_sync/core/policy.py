"""Small, runtime-independent recovery policy for the redesigned sync module."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Decision:
    outcome: str
    consecutive: int
    delay: int


def recover(before, after, consecutive, *, failed=False, permanent=False,
            fast_retries=30, slow_seconds=3600):
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
        return Decision('slow_retry', count, slow_seconds)
    return Decision('retry', count, (60, 180, 600)[min(count - 1, 2)])


def smaller(current, minimum):
    if minimum < 1 or current < minimum:
        raise ValueError('invalid slice bounds')
    return max(minimum, current // 2)


