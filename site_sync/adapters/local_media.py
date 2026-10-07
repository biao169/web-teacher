"""Local immutable staging: bounded socket reads, fsync, atomic part receipts.
The root is a private directory owned by the sync service, never a web upload
folder or shared-writable tree. Publication is a DB reference, not live overwrite.
"""
import asyncio
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from site_sync.core.authority import ConflictError
from site_sync.transport.protocol import encode
from .transfer import MediaReceipts


def durable_replace(path,write):
    fd,tmp=tempfile.mkstemp(prefix='pending-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as out:write(out);out.flush();os.fsync(out.fileno())
        os.replace(tmp,path)
        if os.name!='nt':
            d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
            try:os.fsync(d)
            finally:os.close(d)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)


class LocalMedia:
    kind='local'
    part_bytes=65536
    def __init__(self,repo,root):
        self.receipts=MediaReceipts(repo);self.root=Path(root).absolute()
        self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        if self.root.is_symlink() or (os.name!='nt' and self.root.stat().st_mode&0o022):raise ValueError('Private non-writable staging root required')
    def directory(self,f):
        op=f['operation_id']
        if not re.fullmatch('[a-f0-9]{64}',op) or f['staging_key']!='sync/'+op:raise ConflictError('Invalid owned key')
        d=self.root/op
        if d.is_symlink():raise ConflictError('Symlink staging denied')
        d.mkdir(mode=0o700,exist_ok=True)
        owner=d/'owner.json';expected=encode({'operation':op,'version':f['source_version'],'size':f['total_bytes']})
        if owner.exists():
            if owner.is_symlink() or owner.stat().st_size>2048 or owner.read_bytes()!=expected:raise ConflictError('Unknown media owner')
        else:durable_replace(owner,lambda out:out.write(expected))
        return d
    def store_part(self,f,item,peer,buffer_bytes):
        d=self.directory(f);offset=f['committed_bytes'];length=min(f['part_bytes'],f['total_bytes']-offset)
        path=d/('part-'+str(offset))
        if not path.exists():
            connection,response=peer.media(item,f,offset,length)
            try:
                def copy(out):
                    remaining=length
                    while remaining:
                        chunk=response.read(min(buffer_bytes,remaining))
                        if not chunk:raise IOError('Interrupted media stream')
                        out.write(chunk);remaining-=len(chunk)
                durable_replace(path,copy)
            finally:response.close();connection.close()
        if path.is_symlink() or path.stat().st_size!=length:raise ConflictError('Invalid durable media part')
        # At most 64 KiB, never hash the whole media file.
        return hashlib.sha256(path.read_bytes()).hexdigest(),length
    def complete(self,f):
        d=self.directory(f);target=d/'object'
        if target.exists():
            if target.is_symlink() or target.stat().st_size!=f['total_bytes']:raise ConflictError('Invalid complete receipt')
            return
        def assemble(out):
            for offset in range(0,f['total_bytes'],f['part_bytes']):
                p=d/('part-'+str(offset));expected=min(f['part_bytes'],f['total_bytes']-offset)
                if p.is_symlink() or p.stat().st_size!=expected:raise ConflictError('Missing durable part')
                with p.open('rb') as src:
                    while chunk:=src.read(65536):out.write(chunk)
        durable_replace(target,assemble)
    async def step(self,ctx,item,f,peer):
        # Validate before external I/O AND again when saving the receipt.
        await ctx.repo.db.batch([ctx.repo.assertion(ctx.task,ctx.clock(),write=True)])
        if f['committed_bytes']<f['total_bytes']:
            etag,length=await asyncio.to_thread(self.store_part,f,item,peer,min(65536,ctx.task['slice_bytes']))
            await self.receipts.part(ctx,f,f['committed_bytes'],length,etag)
        else:
            await asyncio.to_thread(self.complete,f)
            await self.receipts.uploaded(ctx,f)
    async def discard(self,f):await asyncio.to_thread(self._discard,f)
    def _discard(self,f):
        d=self.directory(f)
        for path in d.iterdir():
            if path.is_symlink() or not path.is_file():raise ConflictError('Unknown staging entry')
            if path.name not in ('owner.json','object') and not re.fullmatch(r'(part-[0-9]+|pending-[A-Za-z0-9_-]+)',path.name):raise ConflictError('Unknown staging entry')
        for path in d.iterdir():path.unlink()
        d.rmdir()
    async def prune_parts(self,f):
        def prune():
            d=self.directory(f)
            for p in d.glob('part-*'):
                if p.is_symlink():raise ConflictError('Unknown part')
                p.unlink()
        await asyncio.to_thread(prune)
