/* One discovery rule for npm and the Python/Windows acceptance entry points. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const roots=[__dirname,path.join(__dirname,'../site_sync/tests')];
const files=roots.flatMap(root=>fs.readdirSync(root).filter(name=>name.endsWith('.test.cjs')).sort().map(name=>path.join(root,name)));
process.env.JSDOM_PATH ||= path.join(__dirname,'node_modules/jsdom');
if(!files.length){process.stderr.write('No DOM tests found.\n');process.exit(1);}
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'teacher-sync-dom-'));
const fixture=path.join(temporary,'pages.json');
const rendered=spawnSync(process.env.TEST_PYTHON||process.env.PYTHON||'python3',['-B','tests/render_sync_pages_v046.py',fixture],{cwd:path.join(__dirname,'..'),env:{...process.env,PYTHONPATH:[path.join(__dirname,'..'),process.env.PYTHONPATH||''].join(path.delimiter)},encoding:'utf8'});
if(rendered.status!==0){fs.rmSync(temporary,{recursive:true,force:true});process.stderr.write(rendered.stdout||'');process.stderr.write(rendered.stderr||'');process.exit(rendered.status??1);}
process.env.SYNC_UI_FIXTURE=fixture;
const result=spawnSync(process.execPath,['--experimental-vm-modules','--test',...files],{cwd:path.join(__dirname,'..'),env:process.env,stdio:'inherit'});
fs.rmSync(temporary,{recursive:true,force:true});
if(result.error)process.stderr.write(result.error.message+'\n');
process.exit(result.status??1);
