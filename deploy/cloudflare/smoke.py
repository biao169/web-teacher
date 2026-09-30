"""GET-only checks for a deployed test website; no login or cloud API calls.
The server may initialize missing transfer defaults on its first GET /transfer/.
Usage: python deploy/cloudflare/smoke.py --origin https://your-worker.workers.dev
Exit 0: selected public checks passed. Exit 1: failed checks. Exit 2: invalid input.
This does not certify authenticated actions, real transfers, or scheduled cleanup.
"""
import argparse
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

CHECKS=(
    ('/health',{200},'application/json','"status"'),
    ('/en',{200},'text/html','<html'),('/zh',{200},'text/html','<html'),
    ('/auth/login',{200},'text/html','<form'),('/transfer/',{200},'text/html','/transfer-static/'),
    ('/assets/public/css/public.css',{200},'text/css',None),
    ('/transfer-static/portal.js',{200},'javascript',None),
    ('/robots.txt',{200},'text/plain','Sitemap: '),
    ('/sitemap.xml',{200},'xml','sitemapindex'),
    ('/backend/app/native/web.py',{404},None,None),('/database/schema.sql',{404},None,None),
    ('/api/admin/media/not-a-real-id/content',{401,403,404},None,None),
)


def origin_value(value):
    p=urlsplit(value)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.path not in ('','/') or p.query or p.fragment:
        raise ValueError('Provide an HTTPS origin without credentials, path or query')
    if p.port not in (None,443):raise ValueError('Use the public HTTPS origin')
    return value.rstrip('/')


class SameOrigin(HTTPRedirectHandler):
    def __init__(self,origin):self.origin=origin
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if urlsplit(newurl)[:2]!=urlsplit(self.origin)[:2]:
            raise ValueError('Cross-origin redirect; check TEACHER_ORIGIN and domain configuration')
        return super().redirect_request(req,fp,code,msg,headers,newurl)


def inspect(origin,open_url=None,*,repeat_startup=False):
    origin=origin_value(origin)
    opener=open_url or build_opener(SameOrigin(origin)).open
    results=[]
    checks=CHECKS + (tuple(c for c in CHECKS if c[0] in ('/en','/auth/login','/transfer/')) if repeat_startup else ())
    for path,statuses,mime,marker in checks:
        started=time.monotonic()
        try:
            req=Request(origin+path,headers={'User-Agent':'teacher-site-readonly-check/1','Accept':'*/*'})
            try:response=opener(req,timeout=15)
            except HTTPError as exc:response=exc
            with response:
                status=response.code;ctype=response.headers.get('Content-Type','').lower()
                body=response.read(2*1024*1024+1)
            text=body.decode('utf-8',errors='replace')
            ok=status in statuses and (mime is None or mime in ctype) and (marker is None or marker in text) and len(body)<=2*1024*1024
            if path=='/robots.txt':ok=ok and ('Sitemap: '+origin+'/sitemap.xml') in text
            results.append({'path':path,'ok':ok,'status':status,'content_type':ctype,'milliseconds':round((time.monotonic()-started)*1000)})
            if text.strip() == 'Hello world':
                results[-1]['hint']='Default Hello world response; verify active Worker deployment'
        except (OSError,URLError,ValueError) as exc:
            # Do not print response bodies, cookies or potentially token-bearing URLs.
            results.append({'path':path,'ok':False,'error':type(exc).__name__,'milliseconds':round((time.monotonic()-started)*1000)})
    return {'scope':'public read-only checks; cloud functional acceptance still required',
            'ok':all(row['ok'] for row in results),'checks':results}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--origin',required=True);p.add_argument('--repeat-startup',action='store_true',help='Repeat main/login/transfer GETs; not a guaranteed cold start');args=p.parse_args()
    try:result=inspect(args.origin,repeat_startup=args.repeat_startup)
    except ValueError as exc:p.error(str(exc))
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0 if result['ok'] else 1

if __name__=='__main__':raise SystemExit(main())
