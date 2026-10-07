"""Deployment-host-only D1 REST adapter. Never bundled into runtime paths."""
import asyncio
import http.client
import json
import re

class RemoteD1:
    def __init__(self,account,database,token,backup):
        if not re.fullmatch('[a-fA-F0-9]{32}',account) or not re.fullmatch('[a-fA-F0-9-]{36}',database):raise ValueError('Invalid D1 identity')
        self.path='/client/v4/accounts/'+account+'/d1/database/'+database+'/query';self.token=token;self.backup_callback=backup
    def send(self,payload):
        connection=http.client.HTTPSConnection('api.cloudflare.com',timeout=60)
        try:
            connection.request('POST',self.path,json.dumps(payload),{'authorization':'Bearer '+self.token,'content-type':'application/json'})
            response=connection.getresponse();data=response.read(4*1024*1024+1)
            if response.status!=200 or len(data)>4*1024*1024:raise RuntimeError('D1 deployment API failed')
            parsed=json.loads(data)
            if not parsed.get('success') or any(not x.get('success') for x in parsed.get('result',[])):raise RuntimeError('D1 deployment batch rejected')
            return parsed['result']
        finally:connection.close()
    async def query(self,sql,args=()):
        result=await asyncio.to_thread(self.send,{'sql':sql,'params':list(args)})
        if len(result)!=1:raise RuntimeError('Unexpected query receipt')
        return result[0].get('results',[])
    async def batch(self,statements):
        result=await asyncio.to_thread(self.send,{'batch':[{'sql':sql,'params':list(args)} for sql,args in statements]})
        if len(result)!=len(statements):raise RuntimeError('Unconfirmed batch; recheck schema')
        return result
    async def backup(self):
        reference=await self.backup_callback()
        if not isinstance(reference,str) or not reference:raise RuntimeError('Missing recovery reference')
        return reference
