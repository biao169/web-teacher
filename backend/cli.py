"""Explicit local initialization, account creation, native-schema checks and demo insertion."""
import argparse,asyncio,getpass,json
from backend.app.config import Settings
from backend.app.native.database import Database
async def main(argv=None):
    """Maintenance always uses the same Settings as the web entrypoint."""
    parser=argparse.ArgumentParser(description='Teacher website maintenance');parser.add_argument('command',choices=['init','init-admin','doctor','seed-demo','seed-examples','reset-data','migrate']);parser.add_argument('--username',default='admin');parser.add_argument('--include-transfer',action='store_true');args=parser.parse_args(argv)
    settings=Settings.from_env();db=Database(settings.database_path)
    if args.command=='reset-data':
        db.initialize(reset=True)
        # Integrated transfer metadata is part of the main reset. Legacy source is preserved.
        print('Configured database reset. Cache/media files and other applications were not deleted.');return
    if args.command=='migrate':
        from backend.app.native.schema_upgrade import migrate
        print(json.dumps(migrate(db),ensure_ascii=False,indent=2));return
    db.initialize()
    if args.command=='init':print('Native database ready; existing rows preserved.');return
    if args.command=='init-admin':
        from backend.app.native.auth import Auth
        from backend.app.security.passwords import Passwords
        from backend.app.adapters.sqlite.passwords import LocalKDF
        password=getpass.getpass('Password (6-128 characters): ')
        if password!=getpass.getpass('Confirm password: '):raise SystemExit('Passwords differ')
        await Auth(db,Passwords(LocalKDF())).bootstrap(args.username,password);print('Administrator created.');return
    if args.command=='seed-examples':
        from backend.app.native.example_cli import run
        await run(settings,args.username);return
    if args.command=='seed-demo':
        from backend.app.native.demo import seed
        print(json.dumps(await seed(db),ensure_ascii=False,indent=2));return
    print(json.dumps({'database':str(settings.database_path),'cache':str(settings.cache_dir),'media':str(settings.media_dir),'transfer_database':str(settings.database_path),'legacy_transfer_source':str(settings.transfer_database_path),'transfer_files':str(settings.transfer_media_dir),**db.verify()},ensure_ascii=False,indent=2))
if __name__=='__main__':asyncio.run(main())
