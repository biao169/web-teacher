"""Conservative per-process cache budgets for Windows, Linux and constrained runtimes."""
import os,time
from pathlib import Path
from threading import RLock
MIB=1024*1024


def memory_snapshot():
    """Return physical/container total and available bytes; no optional dependency."""
    total,available=256*MIB,128*MIB
    try:
        if os.name=='nt':
            import ctypes
            class Status(ctypes.Structure):
                _fields_=[('length',ctypes.c_ulong),('load',ctypes.c_ulong)]+[(key,ctypes.c_ulonglong) for key in ('total_phys','avail_phys','total_page','avail_page','total_virtual','avail_virtual','extended')]
            status=Status();status.length=ctypes.sizeof(status)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                total,available=status.total_phys,status.avail_phys
        else:
            values={line.split(':')[0]:int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if ':' in line}
            total=values.get('MemTotal',total);available=values.get('MemAvailable',values.get('MemFree',available))
            groups=[(Path('/sys/fs/cgroup'),'memory.max','memory.current'),(Path('/sys/fs/cgroup/memory'),'memory.limit_in_bytes','memory.usage_in_bytes')]
            try:
                for line in Path('/proc/self/cgroup').read_text().splitlines():
                    _,controllers,relative=line.split(':',2)
                    if '..' in Path(relative).parts:continue
                    if not controllers:root=Path('/sys/fs/cgroup');limit_name,used_name='memory.max','memory.current'
                    elif 'memory' in controllers.split(','):root=Path('/sys/fs/cgroup/memory');limit_name,used_name='memory.limit_in_bytes','memory.usage_in_bytes'
                    else:continue
                    current=root/relative.lstrip('/')
                    while current!=root:
                        groups.append((current,limit_name,used_name));current=current.parent
            except (OSError,ValueError):pass
            for folder,limit_name,used_name in groups:
                try:
                    limit=int((folder/limit_name).read_text());used=int((folder/used_name).read_text())
                    if 0<limit<2**60:total=min(total,limit);available=min(available,max(0,limit-used))
                except (OSError,ValueError):pass
    except (OSError,ValueError,AttributeError,ImportError):pass
    return max(1,total),max(0,min(total,available))


class CacheBudget:
    def __init__(self,probe=memory_snapshot,clock=time.monotonic,environ=None):
        self.probe,self.clock=probe,clock;env=os.environ if environ is None else environ
        try:self.cap=max(0,min(64,int(env.get('TEACHER_PUBLIC_CACHE_MB','32'))))*MIB
        except ValueError:self.cap=32*MIB
        try:self.workers=max(1,int(env.get('WEB_CONCURRENCY','1')))
        except ValueError:self.workers=1
        self.checked=-float('inf');self.bytes=0;self.templates=32;self.lock=RLock()
    def limits(self):
        with self.lock:
            at=self.clock()
            if at-self.checked>=15:
                total,available=self.probe();self.checked=at
                self.bytes=0 if available<64*MIB else min(self.cap,total//256//self.workers,available//64//self.workers)
                self.templates=32 if available<128*MIB else 96 if total<1024*MIB else 192 if total<4096*MIB else 256
            return self.bytes,self.templates
