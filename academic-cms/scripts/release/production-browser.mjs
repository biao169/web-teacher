import { createServer as httpsServer } from 'node:https'
import { createServer as netServer } from 'node:net'
import { request as httpRequest } from 'node:http'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectRoot, assertLocalBinary } from '../lib/run-command.mjs'
import { assertBuildTarget } from '../lib/build-output.mjs'
import { assertCurrentBuildSource } from './assert-current-source.mjs'
import { runProcess } from './process.mjs'
import { loadMigrations, applyMigrations } from '../db/migrations.mjs'

if (process.platform === 'win32') throw new Error('Use Ubuntu/WSL for the production HTTPS runner and POSIX process-group cleanup')
await assertBuildTarget('ubuntu',projectRoot)
await assertCurrentBuildSource(projectRoot)
const {default:Database}=await import('better-sqlite3')
  const playwright=await assertLocalBinary('playwright')
await mkdir(resolve(projectRoot,'.tmp'),{recursive:true})
if((await lstat(resolve(projectRoot,'.tmp'))).isSymbolicLink())throw new Error('Temporary root must not be a symlink')
const directory=await mkdtemp(resolve(projectRoot,'.tmp/production-e2e-'))
const password=`Cypress!${randomBytes(24).toString('hex')}!Harbor`
const secret=randomBytes(48).toString('hex')
const mediaSecret=randomBytes(48).toString('hex')
const redact=[password,secret,mediaSecret]
const reportDir=resolve(projectRoot,'reports/stage10b/production-browser',randomUUID())
await mkdir(reportDir,{recursive:true})
let upstream,proxy
let serverLog=''
let exitCode
async function freePort(){const server=netServer();await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});const port=server.address().port;await new Promise(ok=>server.close(ok));return port}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  let escalation
  const exited = new Promise(resolve => child.once('close', resolve))
  try { process.kill(-child.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
  escalation = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch { /* Process already exited. */ } }, 500)
  try { await exited } finally { clearTimeout(escalation) }
}
try{
  const databasePath=resolve(directory,'demo.sqlite3')
  const db=new Database(databasePath)
  try{db.pragma('foreign_keys=ON');applyMigrations(db,await loadMigrations(resolve(projectRoot,'migrations')))}finally{db.close()}
  const seed=await runProcess(process.execPath,['--import','tsx','scripts/release/seed-fixture.ts'],{cwd:projectRoot,env:{CMS_E2E_DATABASE:databasePath,CMS_E2E_PASSWORD:password},redact})
  await writeFile(resolve(reportDir,'seed.log'),seed.output)
  if(!seed.passed)throw new Error('Isolated fixture seeding failed')
  const certificate=await runProcess('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',resolve(directory,'key.pem'),'-out',resolve(directory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{timeoutMs:30000})
  if(!certificate.passed)throw new Error('Local TLS certificate generation failed')
  const port=await freePort()
  // TLS terminates only on loopback. This is test infrastructure, never a deployment proxy.
  proxy=httpsServer({key:await readFile(resolve(directory,'key.pem')),cert:await readFile(resolve(directory,'cert.pem'))},(req,res)=>{
    const remote=httpRequest({host:'127.0.0.1',port,method:req.method,path:req.url,headers:{...req.headers,host:`127.0.0.1:${port}`}},r=>{res.writeHead(r.statusCode ?? 502,r.headers);r.pipe(res)})
    remote.setTimeout(15000,()=>remote.destroy(new Error('upstream timeout')))
    remote.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Upstream unavailable')})
    req.on('aborted',()=>remote.destroy());req.pipe(remote)
  })
  await new Promise((ok,fail)=>{proxy.once('error',fail);proxy.listen(0,'127.0.0.1',ok)})
  const origin=`https://127.0.0.1:${proxy.address().port}`
  await mkdir(resolve(directory,'media'))
  upstream=spawn(process.execPath,[resolve(projectRoot,'.output/server/index.mjs')],{cwd:projectRoot,shell:false,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',NITRO_HOST:'127.0.0.1',NITRO_PORT:String(port),CMS_DATABASE_PATH:databasePath,NUXT_AUTH_SECRET:secret,NUXT_AUTH_BOOTSTRAP_TOKEN:'',NUXT_AUTH_TRUSTED_ORIGINS:origin,NUXT_AUTH_SECURE_COOKIES:'true',NUXT_MEDIA_GRANT_SECRET:mediaSecret,NUXT_MEDIA_ROOT:resolve(directory,'media'),NUXT_STATIC_MEDIA_ROOT:resolve(projectRoot,'.output/public'),NUXT_PUBLIC_SITE_URL:origin,NUXT_CACHE_ORIGIN:origin}})
  let spawnError=null
  upstream.once('error',error=>{spawnError=error})
  for(const stream of [upstream.stdout,upstream.stderr])stream.on('data',chunk=>{if(serverLog.length<2*1024*1024)serverLog+=chunk.toString()})
  const deadline=Date.now()+45000
  let ready=false
  while(Date.now()<deadline){
    if(spawnError || upstream.exitCode!==null || upstream.signalCode!==null)throw new Error('Production server exited before readiness')
    try{const health=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(1000)});const home=await fetch(`http://127.0.0.1:${port}/api/v1/public/home?locale=zh`,{signal:AbortSignal.timeout(2000)});if(health.ok&&home.ok){ready=true;break}}catch{ /* Retry until the readiness deadline. */ }
    await new Promise(ok=>setTimeout(ok,100))
  }
  if(!ready)throw new Error('Production server did not become ready with real data')
  const selectedProject=process.env.CMS_E2E_PROJECT
  if(selectedProject && !/^(?:mobile-)?(?:chromium|firefox)-production$/u.test(selectedProject))throw new Error('Unknown browser test project')
  const result=await runProcess(playwright,['test','--config','playwright.production.config.ts',...(selectedProject?['--project',selectedProject]:[])],{cwd:projectRoot,env:{CMS_E2E_BASE_URL:origin,CMS_E2E_DATABASE:databasePath,CMS_E2E_PASSWORD:password,CMS_E2E_RESULT:resolve(reportDir,'playwright.json'),CMS_E2E_OUTPUT:resolve(reportDir,'test-artifacts')},redact,timeoutMs:300000})
  await writeFile(resolve(reportDir,'playwright.log'),result.output)
  // Playwright's structured report is independently scrubbed before it is retained.
  const resultPath = resolve(reportDir, 'playwright.json')
  const structured = await readFile(resultPath, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (structured) {
    let safe = structured
    for (const value of redact) safe = safe.split(value).join('[REDACTED]')
    await writeFile(resultPath, safe)
  }
  exitCode=result.passed?0:1
  process.stdout.write(result.output)
}finally{
  await stop(upstream)
  if(proxy){proxy.closeAllConnections();await new Promise(ok=>proxy.close(ok))}
  for(const value of redact)serverLog=serverLog.split(value).join('[REDACTED]')
  await writeFile(resolve(reportDir,'server.log'),serverLog)
  await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}
process.exitCode=exitCode
