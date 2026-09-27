"""Capture native administrator initialization as offline SQL, without contacting D1."""
import argparse,asyncio,getpass,os,sqlite3,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from backend.app.native.auth import Auth
from backend.app.security.passwords import Passwords
from backend.app.adapters.sqlite.passwords import LocalKDF
class Capture:
    """Collect the exact local bootstrap statements for offline SQL generation."""
    def __init__(self):"""保存构造参数和适配器，供此对象后续操作复用。""";self.statements=[]
    async def query(self,*args):"""在离线捕获器中模拟空库查询，不连接远程数据库。""";return []
    async def batch(self,items):"""记录原生管理员初始化语句，供离线SQL文件导出。""";self.statements.extend(items);return [[] for _ in items]
async def main():
    """Prompt for credentials and write private native SQL outside the source tree."""
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args();username=input('Administrator username: ').strip();password=getpass.getpass('Password: ')
    if password!=getpass.getpass('Confirm password: '):raise ValueError('Passwords differ')
    capture=Capture();uid=await Auth(capture,Passwords(LocalKDF())).bootstrap(username,password);lines=[]
    with sqlite3.connect(':memory:') as c:
        for sql,values in capture.statements:
            parts=sql.split('?');result=parts[0]
            for value,part in zip(values,parts[1:]):result+=c.execute('SELECT quote(?)',(value,)).fetchone()[0]+part
            lines.append(result+';')
    output=a.output.expanduser().resolve()
    if output.is_relative_to(ROOT):raise ValueError('Output must be outside source')
    with os.fdopen(os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:f.write('\n'.join(lines)+'\n')
    print('Native administrator SQL saved. CMS manager UID: '+uid)
if __name__=='__main__':asyncio.run(main())
