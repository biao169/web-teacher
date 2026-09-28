import logging,os,time
from deploy.shared.service import RuntimeLog


def emit(h,text='hello',level=logging.INFO):
    h.handle(logging.LogRecord('test',level,'',0,text,(),None))


def test_rotation_is_bounded_and_latest_survives(tmp_path):
    h=RuntimeLog(tmp_path,max_bytes=256,backups=5)
    try:
        for i in range(100):emit(h,str(i)+' x'*40)
        files=list(tmp_path.iterdir())
        assert len(files)<=6
        assert all(p.stat().st_size<=256 for p in files)
        assert '99 ' in h.path.read_text()
    finally:h.close()


def test_retention_only_removes_owned_archives(tmp_path):
    old=tmp_path/'service.log.1';old.write_text('old');os.utime(old,(0,0))
    keep=tmp_path/'report.txt';keep.write_text('keep');os.utime(keep,(0,0))
    h=RuntimeLog(tmp_path)
    try:assert not old.exists() and keep.exists()
    finally:h.close()


def test_duplicate_warning_summary_and_bounded_map(tmp_path):
    h=RuntimeLog(tmp_path)
    try:
        for _ in range(20):emit(h,'same error',logging.ERROR)
        assert h.path.read_text().count('same error')==1
        for entry in h.seen.values():entry[0]-=61
        h.maintain()
        assert 'suppressed 19 times' in h.path.read_text()
        for i in range(300):emit(h,str(i),logging.WARNING)
        assert len(h.seen)<=128
    finally:h.close()


def test_restart_appends_without_discarding_log(tmp_path):
    h=RuntimeLog(tmp_path);emit(h,'before');h.close()
    h=RuntimeLog(tmp_path);emit(h,'after');h.close()
    assert 'before' in h.path.read_text() and 'after' in h.path.read_text()
