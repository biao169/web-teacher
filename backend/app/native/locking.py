"""Cross-platform process lock prevents resetting a database served by this application."""
from pathlib import Path
class RuntimeLock:
    def __init__(self,database):"""保存构造参数和适配器，供此对象后续操作复用。""";self.path=Path(str(database)+'.runlock');self.file=None
    def __enter__(self):
        """获取非阻塞运行锁，拒绝另一进程同时占用数据库。"""
        self.path.parent.mkdir(parents=True,exist_ok=True);self.file=self.path.open('a+b');self.file.seek(0);self.file.write(b'0');self.file.flush();self.file.seek(0)
        try:
            import os
            if os.name=='nt':
                import msvcrt;msvcrt.locking(self.file.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl;fcntl.flock(self.file.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:self.file.close();self.file=None;raise ValueError('The database is in use. Stop its service before reset/start.') from None
        return self
    def __exit__(self,*args):
        """释放当前对象持有的数据库运行锁。"""
        if self.file:self.file.close();self.file=None
