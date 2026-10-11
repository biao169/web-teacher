"""Standalone Public error response: no SQL, identity, Jinja or shared app context."""
import html,re,uuid
from functools import lru_cache
from urllib.parse import urlencode
from fastapi.responses import HTMLResponse

@lru_cache(maxsize=1)
def template():
    try:
        from generated_public_recovery import HTML
        return HTML
    except ModuleNotFoundError as exc:
        if exc.name!='generated_public_recovery':raise
        from pathlib import Path
        return (Path(__file__).resolve().parents[3]/'frontend/public/templates/public-recovery.html').read_text(encoding='utf-8')

def eligible(request):
    return bool(getattr(request.state,'public_recovery_eligible',False))

def response(request):
    en=request.url.path.split('/')[1]=='en'
    attempted=request.query_params.get('__recover')=='1'
    # Preserve repeated business parameters; only the transport marker is replaced.
    query=[(k,v) for k,v in request.query_params.multi_items() if k!='__recover']+[('__recover','1')]
    url=request.url.path+'?'+urlencode(query)
    trace=getattr(request.state,'request_id',None) or uuid.uuid4().hex
    request.state.request_id=trace
    values={'LANG':'en' if en else 'zh','TITLE':'This page could not be loaded.' if en else '页面暂时没有加载成功',
            'SITE':'Academic Website' if en else '教师个人网站','URL':url,'ATTEMPTED':'1' if attempted else '0',
            'MESSAGE':('The page is still unavailable. Please try again manually.' if en else '页面暂时仍不可用，请稍后手动重新加载。') if attempted else ('Trying again with fresh content…' if en else '正在重新尝试获取最新内容…'),
            'STATUS':('Automatic retry stopped' if en else '自动重试已停止') if attempted else ('One automatic retry in a moment' if en else '即将自动重试一次'),
            'BUTTON':'Reload' if en else '重新加载','NOTE':'Only this page will be reloaded. Your browser data stays untouched.' if en else '仅重新加载当前页面，不会清除浏览器数据。',
            'EYEBROW':'PLEASE STAND BY' if en else '请稍候','DRAG':'Drag to move, or use arrow keys' if en else '拖动小助手，或用方向键移动','DRAGSHORT':'DRAG TO MOVE' if en else '拖动小助手','TRACE':str(trace)[:64]}
    body=re.sub(r'@@([A-Z]+)@@',lambda m:html.escape(values[m[1]],quote=True),template())
    headers={'Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','Retry-After':'1',
             'X-Request-ID':str(trace)[:64],'X-Public-Recovery':'1','X-Robots-Tag':'noindex, nofollow',
             'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
             'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}
    return HTMLResponse('' if request.method=='HEAD' else body,status_code=503,headers=headers)
