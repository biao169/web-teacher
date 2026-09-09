import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { resolve } from 'node:path'
const output=process.env.STAGE26_CORE_OUTPUT; if(!output)throw new Error('STAGE26_CORE_OUTPUT is required')
const require=createRequire(import.meta.url); const registry=require(resolve(output,'shared/admin/registry.js')); const paths=require(resolve(output,'shared/admin/paths.js')); const auth=require(resolve(output,'shared/enums/auth.js'))
function userWith(modules,mustChangePassword=false){const permissions={};for(const module of auth.AUTH_MODULES)permissions[module]={view:false,create:false,edit:false,delete:false,export:false};for(const module of modules)permissions[module].view=true;return{uid:'user:test',username:'tester',displayName:'Tester',email:null,role:{uid:'role:test',name:'Tester',level:100,isSystem:false},mustChangePassword,visibilityScopes:['public'],permissions}}
test('registry covers every auth module exactly once',()=>{const modules=registry.ADMIN_MODULES.map(item=>item.module);assert.equal(modules.length,auth.AUTH_MODULES.length);assert.deepEqual([...new Set(modules)].sort(),[...auth.AUTH_MODULES].sort());assert.equal(new Set(registry.ADMIN_MODULES.map(item=>item.path)).size,registry.ADMIN_MODULES.length)})
test('route resolution uses exact dashboard and bounded prefixes',()=>{assert.equal(registry.adminModuleForPath('/admin').module,'dashboard');assert.equal(registry.adminModuleForPath('/admin/settings/site/edit').module,'site_settings');assert.equal(registry.adminModuleForPath('/admin/auth/users').module,'auth');assert.equal(registry.adminModuleForPath('/admin/settings'),null);assert.equal(registry.adminModuleForPath('/admin/forbidden'),null);assert.equal(registry.adminModuleForPath('/administrator'),null);assert.equal(registry.adminModuleForPath('/admin//profiles'),null)})
test('navigation is permission-aware and forced-password users see no modules',()=>{const user=userWith(['dashboard','publications','messages']);assert.deepEqual(registry.visibleAdminModules(user).map(item=>item.module),['dashboard','publications','messages']);assert.deepEqual(registry.visibleAdminModules(userWith(['dashboard'],true)),[]);assert.equal(registry.hasAdminPermission(user,'publications','view'),true);assert.equal(registry.hasAdminPermission(user,'publications','edit'),false)})
test('breadcrumb groups link to the canonical or first permitted module',()=>{
  assert.equal(registry.adminGroupLandingPath('research'),'/admin/publications')
  assert.equal(registry.adminGroupLandingPath('research',userWith(['patents'])),'/admin/patents')
  assert.equal(registry.adminGroupLandingPath('research',userWith(['messages'])),null)
  assert.deepEqual(registry.adminBreadcrumbs('/admin/patents',userWith(['patents'])),[
    {label:'管理后台',to:'/admin'},
    {label:'科研成果',to:'/admin/patents'},
    {label:'专利与软件著作'},
  ])
})
test('breadcrumbs distinguish content editors and specialist child pages',()=>{
  assert.deepEqual(registry.adminBreadcrumbs('/admin/publications/publications%3Aalpha'),[
    {label:'管理后台',to:'/admin'},
    {label:'科研成果',to:'/admin/publications'},
    {label:'论文',to:'/admin/publications'},
    {label:'编辑论文'},
  ])
  for(const [path,module,label] of [
    ['/admin/publications/metadata','论文','元数据工具'],
    ['/admin/patents/metadata','专利与软件著作','元数据工具'],
    ['/admin/news/editor/news%3Aalpha','新闻动态','富文本编辑'],
    ['/admin/translation/suggestions','翻译缓存与任务','历史值建议'],
    ['/admin/media/trash','媒体库','回收站'],
  ]){
    const items=registry.adminBreadcrumbs(path)
    assert.equal(items.at(-2).label,module,path)
    assert.equal(items.at(-2).to,registry.adminModuleForPath(path).path,path)
    assert.deepEqual(items.at(-1),{label},path)
  }
})
test('breadcrumbs recognize canonical in-page editor queries without echoing record ids',()=>{
  assert.equal(registry.adminBreadcrumbs('/admin/media?edit=media%3Aalpha').at(-1).label,'编辑媒体信息')
  assert.equal(registry.adminBreadcrumbs('/admin/translation?edit=translation%3Aalpha').at(-1).label,'人工修订')
  assert.equal(registry.adminBreadcrumbs('/admin/auth?tab=roles&edit=role%3Aalpha').at(-1).label,'编辑角色')
  assert.equal(registry.adminBreadcrumbs('/admin/auth?tab=users&edit=user%3Aalpha').at(-1).label,'编辑用户')
  assert.equal(registry.adminBreadcrumbs('/admin/logs?detail=log%3Aalpha').at(-1).label,'日志详情')
  assert.equal(registry.adminBreadcrumbs('/admin/media?edit=%2Funsafe').at(-1).label,'媒体库')
})
test('standalone administration pages retain a dashboard return link',()=>{
  assert.deepEqual(registry.adminBreadcrumbs('/admin/forbidden'),[{label:'管理后台',to:'/admin'},{label:'无权访问'}])
  assert.deepEqual(registry.adminBreadcrumbs('/admin/not-found'),[{label:'管理后台',to:'/admin'},{label:'页面不存在'}])
  assert.deepEqual(registry.adminBreadcrumbs('/admin/unavailable'),[{label:'管理后台',to:'/admin'},{label:'服务暂不可用'}])
  assert.deepEqual(registry.adminBreadcrumbs('/admin/system-check'),[{label:'管理后台',to:'/admin'},{label:'系统检查'}])
})
test('return paths reject public, external and encoded routing structure',()=>{assert.equal(paths.safeAdminReturnPath('/admin/publications?page=2'),'/admin/publications?page=2');for(const bad of ['/zh','//evil.invalid/admin','/admin/%252f..%252fapi','https://evil.invalid/admin','/admin/%2e%2e/auth'])assert.equal(paths.safeAdminReturnPath(bad),'/admin')})
test('route resolution rejects encoded structural ambiguity',()=>{
  for(const value of [
    '/admin/settings/site/%2e%2e/global',
    '/admin/settings/site/%252e%252e/global',
    '/admin/settings/site/%2fglobal',
    '/admin/settings/site/%255cglobal',
  ]) assert.equal(registry.adminModuleForPath(value),null,value)
})
