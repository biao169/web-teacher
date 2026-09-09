#!/usr/bin/env python3
"""Developer packaging entry. Excludes live state; hashes and verifies every byte."""
import argparse
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import stat
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--teacher',type=Path,required=True)
    parser.add_argument('--transfer',type=Path,required=True)
    parser.add_argument('--launchers',type=Path,required=True)
    parser.add_argument('--additions',type=Path,required=True)
    parser.add_argument('--stage',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    stage=args.stage.resolve()
    sources=[args.teacher.resolve(),args.transfer.resolve(),args.launchers.resolve(),args.additions.resolve()]
    if any(stage==p or stage in p.parents or p in stage.parents for p in sources):
        raise ValueError('Stage must be separate from every source')
    if stage.exists(): raise ValueError('Use a fresh staging directory')
    loader=importlib.util.spec_from_file_location('teacher_pack',args.teacher/'scripts/release/package-source.py')
    module=importlib.util.module_from_spec(loader);loader.loader.exec_module(module)
    module.require_source(args.teacher)
    inventory=[]
    for path in module.enumerate_source(args.teacher):inventory.append((path,'academic-cms/'+path.relative_to(args.teacher).as_posix()))
    roots={'package.json','pnpm-lock.yaml','.node-version','.gitignore','config.example.json','README.md'}
    dirs={'server','shared','integration','web','deploy','tests','docs','scripts'}
    for name in sorted(roots):inventory.append((args.transfer/name,'file-transfer/'+name))
    inventory.append((args.transfer/'storage/README.md','file-transfer/storage/README.md'))
    for directory in dirs:
        for path in (args.transfer/directory).rglob('*'):
            if path.is_symlink():raise ValueError('Symlink in transfer source')
            if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc':inventory.append((path,'file-transfer/'+path.relative_to(args.transfer).as_posix()))
    for source in [args.launchers,args.additions]:
        for path in source.rglob('*'):
            if path.is_file() and path.name!='SOURCE-MANIFEST.json' and '__pycache__' not in path.parts:
                inventory.append((path,path.relative_to(source).as_posix()))
    manifest={};ft_manifest={}
    for path,name in sorted(inventory,key=lambda item:item[1]):
        if name in manifest:raise ValueError('Duplicate: '+name)
        if path.is_symlink() or path.suffix in {'.sqlite','.sqlite3','.db','.pem','.key','.pkcs8','.zip'} or path.name=='config.local.json':raise ValueError('Private/runtime path: '+name)
        if path.name.startswith('.env') and path.name!='.env.example':raise ValueError('Private environment')
        value=path.read_bytes()
        if re.search(rb'^-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----\r?\n',value,re.M):raise ValueError('Private key material: '+name)
        if path.suffix in {'.cmd','.ps1'}:
            value=value.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
        elif path.suffix=='.sh':value=value.replace(b'\r\n',b'\n')
        target=stage/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(value)
        target.chmod(0o755 if path.suffix=='.sh' else 0o644)
        digest=hashlib.sha256(value).hexdigest();manifest[name]=digest
        if name.startswith('file-transfer/'):ft_manifest[name[len('file-transfer/'):]]=digest
    ft_manifest_path=stage/'file-transfer/SOURCE-MANIFEST.json'
    ft_manifest_path.write_text(json.dumps(ft_manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    manifest['file-transfer/SOURCE-MANIFEST.json']=hashlib.sha256(ft_manifest_path.read_bytes()).hexdigest()
    (stage/'SOURCE-MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    output=args.output.resolve();output.parent.mkdir(parents=True,exist_ok=True)
    with ZipFile(output,'w',ZIP_DEFLATED,compresslevel=9) as archive:
        for path in sorted(p for p in stage.rglob('*') if p.is_file()):
            name=path.relative_to(stage).as_posix()
            entry=ZipInfo('academic-suite/'+name,date_time=(2026,9,8,0,0,0));entry.create_system=3
            entry.external_attr=(stat.S_IFREG | (0o755 if name.endswith('.sh') else 0o644))<<16
            entry.compress_type=ZIP_DEFLATED;archive.writestr(entry,path.read_bytes())
    with ZipFile(output) as archive:
        if archive.testzip() is not None:raise ValueError('CRC failed')
        for name,digest in manifest.items():
            if hashlib.sha256(archive.read('academic-suite/'+name)).hexdigest()!=digest:raise ValueError(name)
    print(json.dumps({'files':len(manifest)+1,'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'stage':str(stage)},ensure_ascii=False))

if __name__=='__main__':main()
