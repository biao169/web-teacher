#!/usr/bin/env python3
"""Package only allowlisted tool source; never include real storage/config or teacher code."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import argparse
import hashlib
import json
import os
import stat

ROOT = Path(__file__).resolve().parent.parent
ROOT_FILES = {'package.json', 'pnpm-lock.yaml', '.node-version', '.gitignore', 'config.example.json', 'README.md'}
SOURCE_DIRS = {'server', 'shared', 'integration', 'web', 'deploy', 'tests', 'docs', 'scripts'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError('Write archive outside file-transfer/')
    files = [ROOT / name for name in sorted(ROOT_FILES)] + [ROOT / 'storage/README.md']
    for directory in sorted(SOURCE_DIRS):
        for base, dirs, names in os.walk(ROOT / directory, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d != '__pycache__')
            if any((Path(base) / d).is_symlink() for d in dirs):
                raise ValueError('Source directory symlink is not allowed')
            files.extend(Path(base) / n for n in sorted(names) if not n.endswith('.pyc'))
    manifest = {}
    for path in files:
        if path.is_symlink() or not path.is_file():
            raise ValueError('Missing source or symlink: ' + str(path.relative_to(ROOT)))
        relative = path.relative_to(ROOT).as_posix()
        if path.name.startswith('.env') or path.suffix in {'.sqlite', '.db', '.pem', '.key', '.zip', '.log'} or path.name == 'config.local.json':
            raise ValueError('Runtime or private file found in source directories: ' + relative)
        manifest[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.zip.part')
    try:
        with ZipFile(temporary, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
            for path in sorted(files):
                relative = path.relative_to(ROOT).as_posix()
                entry = ZipInfo('file-transfer/' + relative, date_time=(2026, 9, 7, 0, 0, 0))
                entry.create_system = 3
                mode = 0o755 if path.name.endswith('.sh') else 0o644
                entry.external_attr = (stat.S_IFREG | mode) << 16
                entry.compress_type = ZIP_DEFLATED
                archive.writestr(entry, path.read_bytes())
            archive.writestr('file-transfer/SOURCE-MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        with ZipFile(temporary) as archive:
            assert archive.testzip() is None
            assert len(archive.namelist()) == len(set(archive.namelist())) == len(manifest) + 1
            for name, digest in manifest.items():
                assert hashlib.sha256(archive.read('file-transfer/' + name)).hexdigest() == digest
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n', encoding='utf8')
    print(json.dumps({'archive': output.name, 'files': len(manifest), 'bytes': output.stat().st_size, 'sha256': digest, 'verified': True}, ensure_ascii=False))

if __name__ == '__main__':
    main()
