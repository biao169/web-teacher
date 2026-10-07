"""New sync boundaries. Adapters will implement these in subsequent steps.

These interfaces specify guarantees, not deployed endpoints or schema DDL.
"""
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol


class Phase(StrEnum):
    DISCOVER = 'discover'
    CONFIRM = 'await_confirmation'
    TRANSFER = 'transfer'
    APPLY = 'apply'
    CLEANUP = 'cleanup'
    DONE = 'done'


class Status(StrEnum):
    READY = 'ready'
    RUNNING = 'running'
    WAITING = 'waiting'
    PAUSED = 'paused'
    CANCEL_REQUESTED = 'cancel_requested'
    CANCELLED = 'cancelled'
    DONE = 'done'


@dataclass(frozen=True)
class Lease:
    task_id: str
    token: str
    attempt_id: str
    grant_revision: str
    expires_at: int  # UTC epoch seconds; never local display time.


@dataclass(frozen=True)
class Position:
    sequence: int
    offset: int
    source_version: str


@dataclass(frozen=True)
class Slice:
    offset: int
    source_version: str
    data: bytes

    def __post_init__(self):
        if self.offset < 0 or not self.source_version or not isinstance(self.data, bytes):
            raise ValueError('invalid slice')
        if not 0 < len(self.data) <= 65536:
            raise ValueError('slice exceeds bounded application buffer')


class TaskStore(Protocol):
    async def read(self, task_id: str) -> dict:
        """Bounded task metadata only; no body or entire candidate payload."""
        ...

    async def claim(self, now: int) -> dict | None:
        """Acquire one due task with fresh authorization and a global exclusive lease."""
        ...

    async def reconcile_one(self, now: int) -> bool:
        """Reconcile at most one expired attempt before any business replay."""
        ...

    async def finish(self, task: dict, now: int, *, error=None,
                     permanent=False, resource=False, uncertain=False) -> bool:
        """Persist outcome using actual progress and the same attempt/lease token."""
        ...


class PeerReader(Protocol):
    async def field_slice(self, record_id: str, field: str, version: str,
                          offset: int, maximum_bytes: int) -> Slice:
        """Authenticated bounded byte range tied to one immutable source version."""
        ...


class BusinessWriter(Protocol):
    async def apply_staged(self, lease: Lease, item_id: str,
                           expected_target_version: str) -> Position:
        """Apply one complete staged record and its progress in one DB transaction.

        Read long content in the database where possible; never parse whole task.
        A repeated committed item must not duplicate audit or business effects.
        """
        ...
