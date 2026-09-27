/* One discovery rule for npm and the Python/Windows acceptance entry points. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const files=fs.readdirSync(__dirname).filter(name=>name.endsWith('.test.cjs')).sort().map(name=>path.join(__dirname,name));
if(!files.length){process.stderr.write('No DOM tests found.\n');process.exit(1);}
const result=spawnSync(process.execPath,['--experimental-vm-modules','--test',...files],{cwd:path.join(__dirname,'..'),env:process.env,stdio:'inherit'});
if(result.error)process.stderr.write(result.error.message+'\n');
process.exit(result.status??1);
