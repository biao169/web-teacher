/* One discovery rule for npm and the Python/Windows acceptance entry points. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const roots=[__dirname,path.join(__dirname,'../site_sync/tests')];
const files=roots.flatMap(root=>fs.readdirSync(root).filter(name=>name.endsWith('.test.cjs')).sort().map(name=>path.join(root,name)));
process.env.JSDOM_PATH ||= path.join(__dirname,'node_modules/jsdom');
if(!files.length){process.stderr.write('No DOM tests found.\n');process.exit(1);}
const result=spawnSync(process.execPath,['--experimental-vm-modules','--test',...files],{cwd:path.join(__dirname,'..'),env:process.env,stdio:'inherit'});
if(result.error)process.stderr.write(result.error.message+'\n');
process.exit(result.status??1);
