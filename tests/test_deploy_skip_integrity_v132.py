"""Deployment skips manifests; packaging can still explicitly verify its own output."""
import json,subprocess,sys
from pathlib import Path
import pytest
from deploy.linux import tweb
ROOT=Path(__file__).resolve().parents[1]

@pytest.mark.parametrize('manifest',[None,'not json','{"format":"outdated"}'])
def test_legacy_verify_command_skips_missing_or_invalid_manifest(tmp_path,manifest):
 if manifest is not None:(tmp_path/'release-manifest.json').write_text(manifest)
 result=subprocess.run([sys.executable,'-B',str(ROOT/'deploy/vps/release.py'),'verify','--root',str(tmp_path)],capture_output=True,text=True)
 assert result.returncode==0,result.stderr
 assert json.loads(result.stdout)['skipped'] is True
 strict=subprocess.run([sys.executable,'-B',str(ROOT/'deploy/vps/release.py'),'verify','--strict','--root',str(tmp_path)],capture_output=True,text=True)
 assert strict.returncode!=0

def test_required_entry_checks_do_not_require_manifest(tmp_path):
 names=('pyproject.toml','database/schema.sql','backend/entrypoints/vps.py','deploy/linux/tweb.py','deploy/shared/launcher.py','deploy/shared/requirements/requirements-vps.lock','deploy/vps/release.py')
 for name in names:
  p=tmp_path/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('# test')
 tweb.check_source(tmp_path)
 (tmp_path/'backend/entrypoints/vps.py').unlink()
 with pytest.raises(ValueError,match='backend/entrypoints/vps.py'):tweb.check_source(tmp_path)
