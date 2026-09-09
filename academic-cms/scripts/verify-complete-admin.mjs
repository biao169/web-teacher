import { readFile, stat, readdir } from 'node:fs/promises'
import { resolve, relative, dirname, extname } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const failures = []
const passes = []
function pass(value) { passes.push(value) }
function fail(value) { failures.push(value) }
async function exists(path) { try { return (await stat(resolve(root, path))).isFile() } catch { return false } }
async function walk(dir) { const output=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,entry.name);if(entry.isDirectory())output.push(...await walk(p));else output.push(p)}return output }

for (const path of ['shared/complete-admin/core.mjs','server/utils/complete-admin/auth.ts','server/utils/complete-admin/db.ts','app/components/admin/complete/AdminCompleteResourceWorkspace.vue']) (await exists(path) ? pass : fail)(`file:${path}`)
for (const route of ['settings/site','settings/global','navigation','media','translation','auth','logs','import-export']) (await exists(`app/pages/admin/${route}/index.vue`) ? pass : fail)(`route:${route}`)
for (let n=1;n<=9;n+=1){const prefix=String(n).padStart(2,'0');const docs=(await readdir(resolve(root,'docs'))).filter(name=>name.startsWith(`${prefix}_`)&&name.endsWith('.md'));(docs.length===1?pass:fail)(`doc:${prefix}`)}
const files=await walk(resolve(root,'app'))
for(const file of files.filter(f=>extname(f)==='.vue')){const text=await readFile(file,'utf8');if(/\bv-html\s*=/u.test(text))fail(`v-html:${relative(root,file)}`);if(/@tiptap\//u.test(text)&&!relative(root,file).startsWith('app/components/admin/')&&!relative(root,file).startsWith('app/pages/admin/'))fail(`tiptap-public:${relative(root,file)}`)}
const packageJson=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'))
for(const name of ['element-plus','pinia','@tanstack/vue-query','@tiptap/vue-3','@tiptap/starter-kit']) (packageJson.dependencies?.[name]||packageJson.devDependencies?.[name]?pass:fail)(`dependency:${name}`)
for(const n of ['01','02','03','04']){const docs=(await readdir(resolve(root,'docs'))).filter(name=>name.startsWith(`${n}_`)&&name.endsWith('.md'));if(docs.length!==1)fail(`protected-doc:${n}`);else pass(`protected-doc:${n}`)}
const report={status:failures.length?'failed':'passed',passed:passes.length,failed:failures.length,failures,checkedAt:new Date().toISOString()}
console.log(JSON.stringify(report,null,2))
if(failures.length)process.exitCode=1
