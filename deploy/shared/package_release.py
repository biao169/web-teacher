"""Create verified source and lean runtime archives without touching installed data."""
import argparse,json,shutil,tempfile,tomllib,zipfile
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from deploy.vps.release import inventory,verify,write_manifest,EXCLUDED

def archive(folder,target):
 """Generate a content manifest and archive only validated, non-runtime files."""
 files=inventory(folder)
 write_manifest(folder,refresh=True)
 result=verify(folder)
 with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for name in sorted([*files,'release-manifest.json']):z.write(folder/name,'teacher-site/'+name)
 return result|{'archive':target.name,'archive_bytes':target.stat().st_size}

def main():
 """Copy runtime files to temporary staging; refuse existing outputs and nested destinations."""
 p=argparse.ArgumentParser();p.add_argument('--output',required=True,type=Path);args=p.parse_args()
 out=args.output.resolve()
 if out==ROOT or ROOT in out.parents:p.error('输出目录必须在源码目录外')
 version=tomllib.loads((ROOT/'pyproject.toml').read_text())['project']['version']
 targets=[out/f'teacher-site-{kind}-v{version}.zip' for kind in ('source','windows')]
 if any(t.exists() for t in targets):p.error('交付包已存在，拒绝覆盖')
 # Validate before producing any archive; inventory rejects credentials, DBs and symlinks.
 inventory(ROOT);out.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory() as temp:
  stage=Path(temp)
  for name in ('backend','frontend','database','transfer','deploy','docs','legal','tests'):
   shutil.copytree(ROOT/name,stage/name,ignore=shutil.ignore_patterns(*EXCLUDED))
  # Source and lean packages share one maintained guide so update instructions cannot drift.
  # Keep every maintained root shell entry point, including multi-instance install.
  for source in [*[ROOT/n for n in ('pyproject.toml','README.md','.gitignore','.gitattributes')],*sorted(ROOT.glob('*.sh'))]:
   shutil.copyfile(source,stage/source.name)
  results=[archive(ROOT,targets[0]),archive(stage,targets[1])]
 print(json.dumps(results,ensure_ascii=False))
if __name__=='__main__':main()
