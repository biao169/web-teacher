import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { projectRoot } from '../lib/run-command.mjs'
import { inspectEnvironment } from './environment.mjs'
import { inspectContinuity } from './continuity.mjs'
import { sourceIdentity } from './inputs.mjs'
import { runProcess } from './process.mjs'
const full=process.argv.includes('--full')
if(process.argv.slice(2).some(x=>x!=='--full'))throw new Error('Usage: acceptance.mjs [--full]')
const runId=`${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`
const directory=resolve(projectRoot,'reports/stage10b/runs',runId)
await mkdir(directory,{recursive:true})
const report={runId,generatedAt:new Date().toISOString(),scope:full?'full-project':'current-source',status:'running',source:await sourceIdentity(projectRoot),environment:await inspectEnvironment(projectRoot),continuity:await inspectContinuity(projectRoot),checks:[]}
let exitCode=1
try{
 if(report.environment.blockers.length){report.status='blocked_prerequisites';exitCode=2}
 else{
  const commands=[
   ['frozen-install',['install','--frozen-lockfile']],
   ['release-tools',['run','test:release:tools']],
   ['native-core',['run','test:release:native-core']],
   ['typecheck',['run','typecheck']],
   ['production-test-types',['run','typecheck:production-tests']],
   ['lint',['run','lint']],
   ['unit',['run','test:unit']],
   ['native-driver',['run','test:database:native']],
   ['workerd-contract',['run','test:database:workerd']],
   ['ubuntu-build',['run','build:ubuntu']],
   ['production-browser',['run','test:e2e:production']],
   ['cloudflare-build',['run','build:cloudflare']],
  ]
  for(const [name,args]of commands){
   const result=await runProcess('pnpm',args,{cwd:projectRoot,env:{CI:'1'},timeoutMs:600000})
   await writeFile(resolve(directory,`${name}.log`),result.output)
   const {output,...diagnostic}=result
   report.checks.push({name,...diagnostic})
   if(!result.passed){report.status='failed';break}
  }
  if(report.status==='running'){
   const current=await sourceIdentity(projectRoot)
   if(current.digest!==report.source.digest){report.status='source_changed_during_acceptance'}
   else if(full&&!report.continuity.fullProjectReady){report.status='blocked_missing_feature_sources';exitCode=2}
   else{report.status='passed_current_source';exitCode=0}
  }
 }
}finally{
 await writeFile(resolve(directory,'result.json'),JSON.stringify(report,null,2)+'\n')
 await writeFile(resolve(projectRoot,'reports/stage10b/latest-run.json'),JSON.stringify({runId,path:`runs/${runId}/result.json`,status:report.status},null,2)+'\n')
 console.log(JSON.stringify({runId,status:report.status,fullProjectReady:report.continuity.fullProjectReady,executedChecks:report.checks.length},null,2))
}
process.exitCode=exitCode
