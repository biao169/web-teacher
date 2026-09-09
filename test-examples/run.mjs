import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { main } from './support/windows-oneclick/launcher.mjs';

const here=dirname(fileURLToPath(import.meta.url)), root=resolve(here,'..');
const action=process.argv[2]??'check';
const skip=new Set(['node_modules','.nuxt','.output','.git','reports','.tmp','.cache','__pycache__','test-results','playwright-report']);
function copyAllowed(path,source){
  const parts=path.slice(source.length).split(/[\\/]/).filter(Boolean);
  if(['data','media','storage','config.local.json'].includes(parts[0]))return false;
  return !parts.some(p=>skip.has(p)||(p.startsWith('.env')&&p!=='.env.example'));
}
function run(command,args,cwd){
  const result=spawnSync(command,args,{cwd,stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${command} 失败，退出码 ${result.status}`);
}
function install(cwd){
  if(process.platform==='win32')run('powershell.exe',['-NoProfile','-Command','& pnpm install --frozen-lockfile; exit $LASTEXITCODE'],cwd);
  else run('pnpm',['install','--frozen-lockfile'],cwd);
}
try{
  if(!['check','demo','teacher','production-build'].includes(action))throw new Error('用法: node test-examples/run.mjs check|demo|teacher|production-build');
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major!==24||minor<19)throw new Error('需要 Node >=24.19.0 <25 和 pnpm 11.19.0');
  if(action==='check'){
    const nodeTests=readdirSync(join(root,'file-transfer/tests')).filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x);
    install(join(root,'file-transfer'));
    run(process.execPath,['--test','--test-concurrency=1',...nodeTests],join(root,'file-transfer'));
    run(process.execPath,['--test','--test-concurrency=1','tests/launcher.test.mjs'],join(here,'support/windows-oneclick'));
    run(process.execPath,['--test','test-examples/deployment.test.mjs'],root);
    console.log('自动检查完成；未启动生产服务，也未读写生产数据库。');
  }else{
    // An inherited production FT_CONFIG / CMS_DATABASE_PATH must never redirect a demo.
    for(const key of Object.keys(process.env))if(/^(CMS_|NUXT_|FT_|NITRO_)/.test(key))delete process.env[key];
    process.env.NODE_ENV='development';
    const sandbox=join(here,'runtime');
    if(!existsSync(sandbox)){
      mkdirSync(sandbox,{recursive:true});
      for(const name of ['academic-cms','file-transfer'])cpSync(join(root,name),join(sandbox,name),{
        recursive:true,filter:path=>copyAllowed(path,join(root,name)),
      });
      writeFileSync(join(sandbox,'windows-oneclick.config.json'),JSON.stringify({port:18005,openBrowser:false,autoInstall:false}));
      writeFileSync(join(sandbox,'file-transfer/config.local.json'),JSON.stringify({configVersion:1,host:'127.0.0.1',port:18787,dataDirectory:'storage/data'}));
    }
    console.log('独立测试目录: '+sandbox+'；已有示例数据会保留。更新测试源码请先重命名此 runtime 目录。');
    install(join(sandbox,'academic-cms'));install(join(sandbox,'file-transfer'));
    const both=action!=='teacher';
    await main([both?'init-both':'init-teacher',sandbox]);
    if(action==='production-build'){
      run(process.execPath,[join(sandbox,'file-transfer/scripts/teacher.mjs'),'build',join(sandbox,'academic-cms')],join(sandbox,'file-transfer'));
      console.log('隔离目录生产构建通过（不是公网/浏览器传输验收）。');
    }else await main([both?'start-both':'start-teacher',sandbox]);
  }
}catch(error){console.error('[失败] '+error.message);process.exitCode=1;}
