"""Initialize native transfer tables and explicitly authorize an existing teacher account UID."""
import argparse,asyncio
from backend.app.config import Settings
from backend.app.native.database import Database
from backend.app.native.storage import LocalStore
from .native import Transfers
async def main():
    """Use the shared configuration for initialization and structural diagnostics."""
    p=argparse.ArgumentParser();p.add_argument('command',choices=['init','doctor']);p.add_argument('--grant-uid');a=p.parse_args();s=Settings.from_env();db=Database(s.transfer_database_path,'transfer');db.initialize()
    if a.command=='init':await Transfers(db,LocalStore(s.transfer_media_dir)).initialize(a.grant_uid)
    print(db.verify())
if __name__=='__main__':asyncio.run(main())
