"""One shared, idempotent environment preparation path for Windows and Linux."""
from pathlib import Path
import hashlib,subprocess,sys,venv,os
ROOT=Path(__file__).resolve().parents[2]
def prepare_environment():
    """复用虚拟环境，锁文件摘要变化时安装依赖；不读写网站数据库。"""
    if sys.version_info < (3,12):raise SystemExit('Python 3.12+ is required.')
    env=Path(os.environ.get('TEACHER_VENV',str(ROOT/'.venv'))).expanduser().resolve()
    executable=env/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
    if not executable.exists():
        venv.EnvBuilder(with_pip=True).create(env)
    probe=subprocess.run([str(executable),'-c','import sys;sys.exit(sys.version_info < (3,12))'],capture_output=True)
    if probe.returncode:raise SystemExit('Existing virtual environment requires Python 3.12+. Select a new TEACHER_VENV directory; existing files were not removed.')
    lock=ROOT/'deploy/shared/requirements/requirements-vps.lock'
    fingerprint=hashlib.sha256(lock.read_bytes()).hexdigest()
    stamp=env/'teacher-requirements.sha256'
    if not stamp.exists() or stamp.read_text().strip()!=fingerprint:
        subprocess.run([str(executable),'-m','pip','install','--only-binary=:all:','--no-cache-dir','-r',str(lock)],check=True)
        stamp.write_text(fingerprint)
    return executable

def main():
    """Delegate legacy convenience arguments to the single configured launcher."""
    from deploy.shared.launcher import main as launch
    modes={'--demo':'seed','--init-admin':'init','--init-demo-admin':'init'}
    args=sys.argv[1:]
    if args and args[0] not in modes:raise SystemExit('Unsupported option')
    launch([modes[args[0]]] if args else ['start'])
if __name__=='__main__':main()
