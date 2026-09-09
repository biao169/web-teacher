import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat, symlink, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { withBuildTransaction } from '../../scripts/release/build-transaction.mjs'
import { resolveBuildTarget } from '../../scripts/lib/build-output.mjs'
import { sourceIdentity } from '../../scripts/release/inputs.mjs'
import { exactDependency, inspectEnvironment } from '../../scripts/release/environment.mjs'
import { assertCurrentBuildSource } from '../../scripts/release/assert-current-source.mjs'
import { inspectContinuity } from '../../scripts/release/continuity.mjs'
const roots=[]
afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
async function fixture(){const root=await mkdtemp(resolve(tmpdir(),'cms-release-'));roots.push(root);return root}
async function oldOutput(root){await mkdir(resolve(root,'.output'));await writeFile(resolve(root,'.output/previous'),'last-good')}
const exists=path=>access(path).then(()=>true,()=>false)

test('only own build target keys are accepted',()=>{
 for(const key of ['toString','constructor','__proto__',null,undefined]) assert.throws(()=>resolveBuildTarget(key),/Unknown build target/)
})
test('failed build restores the last complete output',async()=>{
 const root=await fixture();await oldOutput(root)
 await assert.rejects(withBuildTransaction(root,async()=>{await mkdir(resolve(root,'.output'));await writeFile(resolve(root,'.output/broken'),'partial');throw new Error('compiler failed')}),/compiler failed/)
 assert.equal(await readFile(resolve(root,'.output/previous'),'utf8'),'last-good')
 assert.equal(await exists(resolve(root,'.output/broken')),false)
 assert.equal(await exists(resolve(root,'.build-lock')),false)
})
test('a successful build commits its own output and releases lock',async()=>{
 const root=await fixture();await oldOutput(root)
 const result=await withBuildTransaction(root,async()=>{await mkdir(resolve(root,'.output'));await writeFile(resolve(root,'.output/current'),'new');return 42})
 assert.equal(result,42);assert.equal(await exists(resolve(root,'.output/previous')),false)
 assert.equal(await readFile(resolve(root,'.output/current'),'utf8'),'new')
 assert.equal(await exists(resolve(root,'.build-lock')),false)
})
test('parallel targets cannot mutate one shared build directory',async()=>{
 const root=await fixture();let entered;const started=new Promise(r=>entered=r);let release;const wait=new Promise(r=>release=r)
 const one=withBuildTransaction(root,async()=>{entered();await wait;await mkdir(resolve(root,'.output'))})
 await started
 await assert.rejects(withBuildTransaction(root,async()=>{assert.fail('second build must not run')}),/already running/)
 release();await one
})
test('a lock left by a dead or recycled build process is recovered automatically',async()=>{
 const root=await fixture();await writeFile(resolve(root,'.build-lock'),JSON.stringify({pid:process.pid,startedAt:new Date(0).toISOString()}))
 const result=await withBuildTransaction(root,async()=>{await mkdir(resolve(root,'.output'));return 'recovered'})
 assert.equal(result,'recovered');assert.equal(await exists(resolve(root,'.build-lock')),false)
})
test('rejecting a pre-existing output symlink does not delete that entry',async()=>{
 const root=await fixture();await mkdir(resolve(root,'untouched'));await writeFile(resolve(root,'untouched/data'),'safe')
 await symlink(resolve(root,'untouched'),resolve(root,'.output'))
 await assert.rejects(withBuildTransaction(root,async()=>assert.fail('must not execute')),/real directory/)
 assert.equal((await lstat(resolve(root,'.output'))).isSymbolicLink(),true)
 assert.equal(await readFile(resolve(root,'untouched/data'),'utf8'),'safe')
})
test('missing output fails rather than retaining an old success marker',async()=>{
 const root=await fixture();await oldOutput(root)
 await assert.rejects(withBuildTransaction(root,async()=>{}))
 assert.equal(await readFile(resolve(root,'.output/previous'),'utf8'),'last-good')
})
test('source identity responds to implementation changes but ignores reports',async()=>{
 const root=await fixture();await mkdir(resolve(root,'app'));await writeFile(resolve(root,'app/app.vue'),'<template>A</template>')
 const one=await sourceIdentity(root);await mkdir(resolve(root,'reports'));await writeFile(resolve(root,'reports/result.json'),'passed')
 assert.equal((await sourceIdentity(root)).digest,one.digest)
 await writeFile(resolve(root,'app/app.vue'),'<template>B</template>')
 assert.notEqual((await sourceIdentity(root)).digest,one.digest)
})
test('source symlinks are not silently fingerprinted as trusted files',async()=>{
 const root=await fixture();await mkdir(resolve(root,'app'));await writeFile(resolve(root,'outside'),'x');await symlink(resolve(root,'outside'),resolve(root,'app/file.ts'))
 await assert.rejects(sourceIdentity(root),/symlink/)
})
test('ubuntu production environment check ignores skipped dev dependencies', async () => {
 const root = await fixture()
 await mkdir(resolve(root, 'node_modules/prod'), { recursive: true })
 await writeFile(resolve(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.19.0', dependencies: { prod: '1.2.3' }, devDependencies: { devonly: '4.5.6' } }))
 await writeFile(resolve(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
 await writeFile(resolve(root, 'node_modules/prod/package.json'), JSON.stringify({ name: 'prod', version: '1.2.3' }))
 const prodOnly = await inspectEnvironment(root, { productionOnly: true, nodeVersion: '24.19.0' })
 assert.deepEqual(prodOnly.blockers.filter(item => item.code === 'DEPENDENCY_MISSING_OR_MISMATCH'), [])
 const full = await inspectEnvironment(root, { nodeVersion: '24.19.0' })
 assert.equal(full.blockers.some(item => item.name === 'devonly'), true)
})
test('exact dependency identity handles npm aliases without permitting ranges',()=>{
 assert.deepEqual(exactDependency('typescript','npm:@typescript/typescript6@6.0.2'),{installedName:'typescript',registryName:'@typescript/typescript6',version:'6.0.2'})
 for(const bad of ['latest','^4.5.2','workspace:*','https://example.invalid/file.tgz','npm:foo@*'])assert.throws(()=>exactDependency('pkg',bad),/Unpinned/)
})
test('reports-only input is returned as incomplete, not a complete source project',async()=>{
 const root=await fixture();await mkdir(resolve(root,'reports'));await writeFile(resolve(root,'reports/validation.md'),'All tests passed')
 const result=await inspectContinuity(root)
 assert.equal(result.fullProjectReady,false);assert.equal(result.features.publicSite.present,false)
 assert.deepEqual(result.migrations,[])
})

test('a symlinked temporary directory cannot move the last good build outside the project',async()=>{
 const root=await fixture();const outside=await fixture();await oldOutput(root)
 await symlink(outside,resolve(root,'.tmp'))
 await assert.rejects(withBuildTransaction(root,async()=>{await mkdir(resolve(root,'.output'))}),/temporary.*real directory/i)
 assert.equal(await readFile(resolve(root,'.output/previous'),'utf8'),'last-good')
})
test('production TypeScript excludes offline declaration substitutes from generated contexts',async()=>{
 const root=resolve(import.meta.dirname,'../..')
 const tsconfig=JSON.parse(await readFile(resolve(root,'tsconfig.json'),'utf8'))
 assert.equal(tsconfig.references.length,4)
 const config=await readFile(resolve(root,'nuxt.config.ts'),'utf8')
 assert.ok(config.includes('tsConfig'))
 for(const context of ['appTsConfig','serverTsConfig','nodeTsConfig','sharedTsConfig'])assert.ok(!config.includes(context),context)
 for(const reference of tsconfig.references){
  const generated=await readFile(resolve(root,reference.path),'utf8')
  assert.ok(!generated.includes('tests/types/offline-runtime.d.ts'),reference.path)
 }
})
test('SSR session loads return CSRF cookie updates to the browser',async()=>{
 const root=resolve(import.meta.dirname,'../..')
 const source=await readFile(resolve(root,'app/composables/useAuthSession.ts'),'utf8')
 assert.ok(source.includes('getSetCookie()'))
 assert.ok(source.includes('appendResponseHeader'))
 assert.ok(source.includes('import.meta.server'))
})
test('personalized SSR documents declare private no-store before page rendering',async()=>{
 const root=resolve(import.meta.dirname,'../..')
 const source=await readFile(resolve(root,'nuxt.config.ts'),'utf8')
 for(const locale of ['zh','en'])for(const path of ['account','account/**','login','register','contact'])assert.ok(source.includes(`'/${locale}/${path}'`),`${locale}/${path}`)
})


test('build proof cannot be reused after implementation or tests change', async () => {
  const root = await fixture()
  await mkdir(resolve(root, 'app')); await writeFile(resolve(root, 'app/app.vue'), '<template>Hello</template>')
  await mkdir(resolve(root, 'tests')); await writeFile(resolve(root, 'tests/check.ts'), 'export const expected = 1')
  await mkdir(resolve(root, '.output'))
  const identity = await sourceIdentity(root)
  await writeFile(resolve(root, '.output/source-proof.json'), JSON.stringify({ schemaVersion: 1, sourceDigest: identity.digest }))
  await assertCurrentBuildSource(root)
  await writeFile(resolve(root, 'tests/check.ts'), 'export const expected = 2')
  await assert.rejects(assertCurrentBuildSource(root), /source|Source|stale/)
})
