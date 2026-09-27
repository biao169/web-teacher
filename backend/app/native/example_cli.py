"""Console entry uses real login and the same bounded example service as the browser."""
import getpass,json
from .runtime import local
from .auth import Auth
from .content import Content
from .examples import Examples
from .example_catalog import GROUPS

async def run(settings,username=None):
    """Require an existing administrator; never synthesize a privileged principal or default password."""
    r=local(settings);r.auth=Auth(r.sql,r.passwords)
    if not await r.sql.query('SELECT 1 FROM auth_users LIMIT 1'):raise ValueError('请先初始化管理员，或启动网站后从“数据与备份 / 示例中心”添加。')
    username=username or input('Administrator username [admin]: ').strip() or 'admin'
    token=await r.auth.login(username,getpass.getpass('Administrator password: '),'local-example-console')
    r.p=await r.auth.principal(token);r.content=Content(r.sql,r.auth);counts={'created':0,'kept':0}
    try:
        service=Examples(r)
        for group,_,count in GROUPS:
            for i in range(1,count+1):
                result=await service.step(group,i);counts[result['status']]+=1
            print(group+' completed',flush=True)
        print(json.dumps(counts));return counts
    finally:await r.auth.logout(r.p)
