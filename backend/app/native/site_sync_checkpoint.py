"""Versioned, bounded progress evidence; no payloads, credentials or retry decisions.

Only persisted execution cursors are evidence. HTTP success, timestamps, work
markers, error text and manual selection changes are deliberately excluded.
This is local bookkeeping, not a change to the signed peer protocol.
"""
VERSION = 3
PATHS = (
    'phase', 'side', 'table_index', 'after', 'count', 'candidate_count',
    'candidate_after', 'load_index', 'skipped', 'prepared_uid',
    'outgoing.confirmed', 'approval.ready',
    'check_index', 'check_ref', 'current.stage', 'analysis.side',
    'analysis.after', 'analysis.reverse_after', 'analysis.processed',
    'current.ref_index', 'current.back_index', 'current.after',
    'latest_pending.side', 'latest_pending.table', 'latest_pending.row.uid',
    'execution.phase', 'execution.file_index', 'execution.offset', 'execution.bytes',
    'execution.applied', 'execution.committed', 'execution.write_table',
    'execution.write_delete', 'execution.write_after', 'execution.cleanup_index',
    'execution.cleanup_offset', 'execution.cleanup_width',
    'execution.prepared.table_index', 'execution.prepared.after',
    'execution.prepared.row_index',
    'execution.prepared.check_table', 'execution.prepared.check_after',
    'execution.prepared.add_index', 'begin_plan.index', 'begin_plan.media_index',
)
CHECKS = ('begin_check', 'commit_check', 'proposal_check')
CHECK_FIELDS = ('phase', 'side', 'table_index', 'after', 'version_count')
MEDIA_FIELDS = ('version', 'merge_width', 'merge_offset', 'assembled_version', 'target_version')


def projection():
    """SQLite/D1 extracts small cursors before crossing into the Python runtime."""
    paths = (*PATHS, *(group+'.'+key for group in CHECKS for key in CHECK_FIELDS))
    values = ["status"] + ["json_extract(state,'$."+path+"')" for path in paths]
    values += ["json_extract(state,'$.execution.media['||coalesce(json_extract(state,'$.execution.file_index'),0)||']."+key+"')" for key in MEDIA_FIELDS]
    # Streams are bounded by the fixed module set; do not read their row titles.
    values.append("(SELECT json_group_array(json_array(json_extract(value,'$.side'),json_extract(value,'$.table'),json_extract(value,'$.after'),json_extract(value,'$.done'),json_extract(value,'$.head.uid'))) FROM json_each(state,'$.streams'))")
    return 'json_array('+','.join(values)+')'


PROJECTION = projection()


def observe(prior, checkpoint, at, *, finished=False, failed=False, uncertain=False):
    """Account for persisted change, including commits whose response was lost.

    Legacy records establish a baseline without inventing historical progress.
    Counters never authorize retries or weaken the existing lock/approval gates.
    """
    known = prior.get('checkpoint_version') == VERSION and 'checkpoint' in prior
    changed = known and prior['checkpoint'] != checkpoint
    stalled = int(prior.get('stalled_attempts', 0))
    if changed:
        stalled = 0
    elif finished or failed or uncertain:
        stalled += 1
    abnormal = failed or uncertain
    outcome = ('progress_after_error' if abnormal else 'progress') if changed else ('no_progress_error' if abnormal else 'no_progress')
    if not known: outcome = 'baseline'
    if not (finished or abnormal or changed): outcome = prior.get('last_outcome', outcome)
    return {
        'last_outcome': outcome,
        'failures_with_progress': int(prior.get('failures_with_progress', 0)) + int(abnormal and changed),
        'no_progress_failures': int(prior.get('no_progress_failures', 0)) + int(abnormal and known and not changed),
        'last_error_code': prior.get('last_error_code'),
        'last_error_at': prior.get('last_error_at'),
        'reconciled_at': prior.get('reconciled_at'),
        'checkpoint_version': VERSION, 'checkpoint': checkpoint,
        'progress_events': int(prior.get('progress_events', 0)) + int(changed),
        'last_progress_at': at if changed else prior.get('last_progress_at'),
        'total_failures': int(prior.get('total_failures', 0)) + int(failed or uncertain),
        'uncertain_attempts': int(prior.get('uncertain_attempts', 0)) + int(uncertain),
        'stalled_attempts': stalled,
    }


def recovery_state(work, phase=None, *, at):
    if work.get('status') == 'running':
        deadline = work.get('recover_after')
        return 'uncertain_wait' if deadline and deadline > at else 'needs_reconciliation'
    if phase in ('done', 'cancelled'):
        return phase
    if work.get('status') == 'paused':
        if not work.get('retryable'):
            return 'needs_attention'
        return 'retry_wait' if (work.get('retry_after') or '') > at else 'retry_due'
    return 'no_progress' if work.get('stalled_attempts', 0) else 'ready'
