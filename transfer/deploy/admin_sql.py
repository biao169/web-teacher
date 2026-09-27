"""Generate a manager grant for an existing teacher account UID, not a separate password account."""
import argparse,re,os
from pathlib import Path
def main():
    """Write explicit native authorization SQL without any network/database mutation."""
    p=argparse.ArgumentParser();p.add_argument('--uid',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9:._-]{1,128}',a.uid):raise ValueError('Invalid UID')
    sql="INSERT INTO admin_grants VALUES ('"+a.uid+"',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'operator');\n"
    with os.fdopen(os.open(a.output,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'w') as f:f.write(sql)
if __name__=='__main__':main()
