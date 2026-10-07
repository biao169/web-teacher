"""Compatibility entry point for the single full-website acceptance runner."""
import argparse,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--full',action='store_true',help='Retained spelling: validation is now always full')
    parser.add_argument('--dom',action='store_true')
    parser.add_argument('--browser',action='store_true')
    parser.add_argument('--report',type=Path)
    args=parser.parse_args();command=[sys.executable,'-B',str(ROOT/'tests/run_acceptance.py')]
    if args.dom:command.append('--dom')
    if args.browser:command.append('--browser')
    if args.report:command+=['--report',str(args.report)]
    return subprocess.call(command,cwd=ROOT)
if __name__=='__main__':raise SystemExit(main())
