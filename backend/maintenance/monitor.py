"""Bounded directory steps and current process measurements; no recursive request scan."""
import asyncio,os,shutil,time
from pathlib import Path
from backend.app.resource_budget import memory_snapshot


def process_memory():
    try:
        if os.name=='nt':
            import ctypes
            class Counters(ctypes.Structure):
                _fields_=[('cb',ctypes.c_ulong),('faults',ctypes.c_ulong)]+[(name,ctypes.c_size_t) for name in ('peak','working','paged_peak','paged','nonpaged_peak','nonpaged','pagefile','pagefile_peak')]
            item=Counters();item.cb=ctypes.sizeof(item)
            kernel=ctypes.WinDLL('kernel32',use_last_error=True);kernel.GetCurrentProcess.restype=ctypes.c_void_p
            psapi=ctypes.WinDLL('psapi',use_last_error=True);psapi.GetProcessMemoryInfo.argtypes=[ctypes.c_void_p,ctypes.POINTER(Counters),ctypes.c_ulong]
            if psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(),ctypes.byref(item),item.cb):return item.working
        else:return int(Path('/proc/self/statm').read_text().split()[1])*os.sysconf('SC_PAGE_SIZE')
    except (OSError,ValueError,IndexError,AttributeError):pass
    return None

class Monitor:
    def __init__(self,settings):
        self.settings=settings;self.roots={'media':settings.media_dir,'cache':settings.cache_dir,'logs':settings.data_dir/'logs','transfer_files':settings.transfer_media_dir,'transfer_cache':settings.transfer_cache_dir}
        self.last=None;self.rows={};self.pending=[];self.stack=[];self.timer=None;self.running=False
    def close(self):
        for iterator,depth in self.stack:iterator.close()
        self.stack=[];self.running=False
        if self.timer:self.timer.cancel();self.timer=None
    def step(self,restart=False):
        if restart or not self.running:
            self.close();self.rows={k:{'bytes':0,'files':0,'skipped':0} for k in self.roots};self.pending=list(self.roots);self.running=True
        if self.timer:self.timer.cancel()
        self.timer=asyncio.get_running_loop().call_later(60,self.close)
        visited=0
        while visited<200 and (self.pending or self.stack):
            if not self.stack:
                self.current=self.pending.pop(0)
                try:self.stack.append((os.scandir(self.roots[self.current]),0))
                except FileNotFoundError:continue
                except OSError:self.rows[self.current]['skipped']+=1;continue
            iterator,depth=self.stack[-1]
            try:entry=next(iterator,None)
            except OSError:
                self.rows[self.current]['skipped']+=1;iterator.close();self.stack.pop();visited+=1;continue
            if entry is None:iterator.close();self.stack.pop();continue
            visited+=1;row=self.rows[self.current]
            try:
                if entry.is_symlink():row['skipped']+=1
                elif entry.is_dir(follow_symlinks=False):
                    if depth>=31:row['skipped']+=1
                    else:self.stack.append((os.scandir(entry.path),depth+1))
                elif entry.is_file(follow_symlinks=False):row['bytes']+=entry.stat(follow_symlinks=False).st_size;row['files']+=1
                else:row['skipped']+=1
            except OSError:row['skipped']+=1
        result={'at':time.time(),'complete':not self.pending and not self.stack,'rows':self.rows,'visited':visited}
        if result['complete']:self.last=result;self.close()
        return result
    def snapshot(self,sql):
        total,available=memory_snapshot();disk={}
        for name,path in self.roots.items():
            try:
                value=shutil.disk_usage(path if path.exists() else path.parent)
                disk[name]={'free':value.free,'total':value.total}
            except OSError:disk[name]=None
        database={}
        for suffix in ('','-wal','-shm'):
            try:database[suffix or 'main']=Path(str(self.settings.database_path)+suffix).stat().st_size
            except FileNotFoundError:database[suffix or 'main']=0
        cache=getattr(sql,'public_cache',None)
        return {'process_bytes':process_memory(),'system_total':total,'system_available':available,'database':database,'disks':disk,'files':self.last,'scan_running':self.running,'public_cache':{'used':cache.used,'budget':cache.budget.limits()[0]} if cache else None}
