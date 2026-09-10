import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')
const walk=(d)=>{const a=path.join(root,d);if(!fs.existsSync(a))return[];return fs.readdirSync(a,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)])}
const source=[...walk('app'),...walk('server')].filter(p=>/\.(vue|ts|js|mjs)$/.test(p)).map(read).join('\n')

test('核心编辑字段具有媒体、建议、关联和富文本注册',()=>{
  const registry=read('app/shared/admin/special-fields.ts')
  for(const key of ['profiles.avatar_key','publications.pdf_key','news.cover_key','news.content','news.related_publication_uid','courses.material_key']) assert.match(registry,new RegExp(key.replace('.','[^\n]+')))
  assert.match(source,/MediaPicker/)
  assert.match(source,/Suggestion/)
})

test('D1 expectedChanges 在提交前由 guard CHECK 断言',()=>{
  const code=read('server/database/d1/atomic-batch.ts')
  const sql=read('migrations/0008_complete_admin_integrity.sql')
  assert.match(code,/changes\(\)/)
  assert.match(code,/database\.batch/)
  assert.match(sql,/CHECK \(actual_changes = expected_changes\)/)
})

test('整站恢复只调用一次 repository batch',()=>{
  const code=read('server/services/admin/atomic-restore.ts')
  assert.equal((code.match(/repository\.batch\(/g)||[]).length,1)
  assert.match(code,/auditCommand/)
  assert.match(code,/generationCommands/)
})

test('专项后台具有媒体、翻译、权限和备份页面',()=>{
  for(const p of ['app/pages/admin/media/index.vue','app/pages/admin/translation/index.vue','app/pages/admin/auth/index.vue','app/pages/admin/import-export/index.vue']) assert.equal(fs.existsSync(path.join(root,p)),true,p)
})
