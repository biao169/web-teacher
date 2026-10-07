"""Create a disposable folder fixture, or compare a saved folder without modifying it.
Usage: python tests/folder_acceptance_fixture.py create PATH [--large-mib 8]
       python tests/folder_acceptance_fixture.py compare SOURCE SAVED
No server, account, database, or existing directory is modified.
"""
import argparse
import hashlib
from pathlib import Path

def inventory(root):
    if not root.is_dir():raise ValueError(f'Not a directory: {root}')
    result={}
    for item in sorted(root.rglob('*')):
        if item.is_symlink():raise ValueError(f'Symlink not accepted: {item}')
        key=item.relative_to(root).as_posix()
        if item.is_dir():result[key]=('directory',)
        elif item.is_file():
            digest=hashlib.sha256()
            with item.open('rb') as stream:
                while block:=stream.read(1024*1024):digest.update(block)
            result[key]=('file',item.stat().st_size,digest.hexdigest())
        else:raise ValueError(f'Special entry not accepted: {item}')
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='command',required=True)
    create=commands.add_parser('create');create.add_argument('path',type=Path);create.add_argument('--large-mib',type=int,default=8)
    compare=commands.add_parser('compare');compare.add_argument('source',type=Path);compare.add_argument('saved',type=Path)
    args=parser.parse_args()
    if args.command=='create':
        if not 1<=args.large_mib<=4096:parser.error('--large-mib must be 1–4096')
        root=args.path;root.mkdir(parents=True,exist_ok=False)
        (root/'empty-directory').mkdir();(root/'资料 Research'/'nested').mkdir(parents=True)
        (root/'zero-byte.txt').touch();(root/'资料 Research'/'中文 résumé.txt').write_text('Folder transfer / 文件夹快传\n',encoding='utf-8')
        (root/'资料 Research'/'nested'/'notes.txt').write_text('Keep hierarchy and names.\n',encoding='utf-8')
        with (root/'multi-chunk.bin').open('xb') as stream:
            block=bytes(range(256))*4096
            for _ in range(args.large_mib):stream.write(block)
            stream.write(b'final short chunk')
        print(f'Created: {root.resolve()}\nEntries: {len(inventory(root))}')
    else:
        source,saved=inventory(args.source),inventory(args.saved)
        differences=[name for name in sorted(source.keys()|saved.keys()) if source.get(name)!=saved.get(name)]
        if differences:
            print('FAIL: different paths, sizes, hashes, or directory types:')
            for name in differences:print(name)
            return 1
        print(f'PASS: {len(source)} entries match, including empty directories and SHA-256 hashes.')
    return 0

if __name__=='__main__':raise SystemExit(main())
