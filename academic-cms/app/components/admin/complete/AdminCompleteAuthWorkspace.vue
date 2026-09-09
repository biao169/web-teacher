<script setup lang="ts">
import { useAdminEditorLifecycle } from '~/composables/useAdminEditorLifecycle'
import AdminFormItem from '../shared/AdminFormItem.vue'
import { ElAlert, ElButton, ElCheckbox, ElCheckboxGroup, ElDialog, ElForm, ElInput, ElInputNumber, ElMessage, ElMessageBox, ElPagination, ElSwitch, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { ElOption, ElSelect, ElTabPane, ElTabs } from '~/admin/element-plus-ts6'
import { formatAdminDateTime as formatTime } from '~/admin/formatters'
import type { AdminListPrimitive, AdminUnifiedColumn, AdminUnifiedSortChange, AdminUnifiedTableRow } from '~/admin/unified-list'
import { hasAdminPermission } from '~~/shared/admin/registry'
import { ADMIN_UID_PATTERN, suggestedAdminUid } from '~~/shared/admin/identity'
import type { SafeUserView } from '~~/shared/contracts/auth'
import type { AuthModule, PermissionAction, VisibilityScope } from '~~/shared/enums/auth'
import AdminDataTable from '../shared/AdminDataTable.vue'
import AdminListToolbar from '../shared/AdminListToolbar.vue'
import AdminQuickField from '../shared/AdminQuickField.vue'
import AdminRowActions from '../shared/AdminRowActions.vue'
import AdminEditorShell from '../shared/AdminEditorShell.vue'
import AdminCheckedFormItem from '../shared/AdminCheckedFormItem.vue'
import AdminIdentitySection from '../shared/AdminIdentitySection.vue'

type UserStatus = 'active' | 'disabled' | 'locked'
type PermissionRow = Record<PermissionAction, boolean>
interface ModuleDefinition { key: AuthModule; title: string; description: string }

const ACTIONS: readonly PermissionAction[] = ['view', 'create', 'edit', 'delete', 'export']
const ACTION_LABELS: Record<PermissionAction, string> = { view: '查看', create: '创建', edit: '编辑', delete: '删除', export: '导出' }
const SCOPE_LABELS: Record<VisibilityScope, string> = { public: '公开内容', authenticated: '登录用户内容', staff: '工作人员内容', owner: '本人内容', hidden: '隐藏内容' }
const STATUS_LABELS: Record<UserStatus, string> = { active: '启用', disabled: '禁用', locked: '锁定' }
const STATUS_TYPES: Record<UserStatus, 'success' | 'danger'> = { active: 'success', disabled: 'danger', locked: 'danger' }

const { request } = useCompleteAdminApi()
const auth = useAuthSession()
const route = useRoute()
const router = useRouter()
const currentUser = computed<SafeUserView | null>(() => auth.session.value.authenticated ? auth.session.value.user as unknown as SafeUserView : null)
const currentUserUid = computed(() => currentUser.value?.uid ?? '')
const currentRoleUid = computed(() => currentUser.value?.role.uid ?? '')
const currentRoleLevel = computed(() => Number(currentUser.value?.role.level ?? 0))
const canCreate = computed(() => hasAdminPermission(currentUser.value, 'auth', 'create'))
const canEdit = computed(() => hasAdminPermission(currentUser.value, 'auth', 'edit'))

const loading = ref(false)
const saving = ref(false)
const tab = ref(route.query.tab === 'permissions' ? 'permissions' : route.query.tab === 'roles' ? 'roles' : 'users')
const editQueryUid = computed(() => typeof route.query.edit === 'string' ? route.query.edit.trim() : '')
const editQueryTab = computed<'users' | 'roles'>(() => route.query.tab === 'roles' ? 'roles' : 'users')
const data = reactive<any>({ users: [], roles: [], permissions: [], modules: [], metrics: {} })
const userFilters = reactive({ q: '' })
const userColumnFilters = reactive<Record<string, AdminListPrimitive | undefined>>({})
const userSort = ref('username')
const userDirection = ref<'asc' | 'desc'>('asc')
const selectedUsers = ref<AdminUnifiedTableRow[]>([])
const userPage = ref(1)
const userPageSize = ref(20)
const roleQuery = ref('')
const roleColumnFilters = reactive<Record<string, AdminListPrimitive | undefined>>({})
const roleSort = ref('sort_order')
const roleDirection = ref<'asc' | 'desc'>('asc')
const selectedRoles = ref<AdminUnifiedTableRow[]>([])

const userColumns = computed<AdminUnifiedColumn[]>(() => [
  { key: 'username', label: '账号', minWidth: 145, primary: true, sortable: true, filterable: true, resizable: true },
  { key: 'display_name', label: '显示名称', minWidth: 140, sortable: true, filterable: true, resizable: true },
  { key: 'email', label: '邮箱', kind: 'long-text', minWidth: 190, sortable: true, filterable: true, resizable: true, twoLine: true },
  { key: 'role_name', label: '角色', minWidth: 150, sortable: true, filterable: true, resizable: true, options: (data.roles as any[]).map(role => ({ value: role.name, label: role.name })) },
  { key: 'status', label: '状态', kind: 'status', width: 112, sortable: true, filterable: true, resizable: true, quickEdit: true, options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label, tone: STATUS_TYPES[value as UserStatus] })) },
  { key: 'must_change_password', label: '待改密', kind: 'boolean', width: 88, sortable: true, filterable: true, resizable: true, options: [{ value: 1, label: '待修改', tone: 'warning' }, { value: 0, label: '正常', tone: 'success' }] },
  { key: 'active_session_count', label: '活动会话', kind: 'integer', width: 92, sortable: true, filterable: true, resizable: true },
  { key: 'last_login_at', label: '最后登录', kind: 'datetime', width: 160, sortable: true, filterable: true, resizable: true },
])
const roleColumns = computed<AdminUnifiedColumn[]>(() => [
  { key: 'name', label: '角色', kind: 'long-text', minWidth: 220, primary: true, sortable: true, filterable: true, resizable: true, twoLine: true },
  { key: 'level', label: '层级', kind: 'integer', width: 80, sortable: true, filterable: true, resizable: true },
  { key: 'visibility_scopes', label: '可见范围', minWidth: 200, sortable: true, filterable: true, resizable: true },
  { key: 'user_count', label: '用户', kind: 'integer', width: 80, sortable: true, filterable: true, resizable: true },
  { key: 'is_active', label: '状态', kind: 'boolean', width: 100, sortable: true, filterable: true, resizable: true, quickEdit: true, options: [{ value: 1, label: '启用', tone: 'success' }, { value: 0, label: '停用', tone: 'danger' }] },
  { key: 'updated_at', label: '更新时间', kind: 'datetime', width: 160, sortable: true, filterable: true, resizable: true },
])
function compareRows(left: any, right: any, key: string, direction: 'asc' | 'desc'): number {
  const a = left[key] ?? ''
  const b = right[key] ?? ''
  const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'zh-CN', { numeric: true })
  return direction === 'asc' ? result : -result
}
function matchesColumnFilters(row: any, filters: Readonly<Record<string, AdminListPrimitive | undefined>>): boolean {
  return Object.entries(filters).every(([key, value]) => {
    if (value === undefined || value === null || value === '') return true
    const source = row[key]
    if (typeof value === 'number' || typeof value === 'boolean') return Number(source) === Number(value)
    return String(source ?? '').toLocaleLowerCase('zh-CN').includes(String(value).toLocaleLowerCase('zh-CN'))
  })
}

const filteredUsers = computed(() => {
  const query = userFilters.q.trim().toLocaleLowerCase('zh-CN')
  return (data.users as any[]).filter(row => {
    const text = `${row.username} ${row.display_name || ''} ${row.email || ''}`.toLocaleLowerCase('zh-CN')
    return (!query || text.includes(query)) && matchesColumnFilters(row, userColumnFilters)
  })
    .sort((left, right) => compareRows(left, right, userSort.value, userDirection.value))
})
const visibleUsers = computed(() => filteredUsers.value.slice((userPage.value - 1) * userPageSize.value, userPage.value * userPageSize.value))
const visibleRoles = computed(() => {
  const query = roleQuery.value.trim().toLocaleLowerCase('zh-CN')
  return (data.roles as any[]).filter(row => (!query || `${row.name} ${row.description || ''}`.toLocaleLowerCase('zh-CN').includes(query)) && matchesColumnFilters(row, roleColumnFilters)).sort((left, right) => compareRows(left, right, roleSort.value, roleDirection.value))
})
const assignableRoles = computed(() => (data.roles as any[]).filter(role => Number(role.is_active) === 1 && Number(role.level) <= currentRoleLevel.value && (Number(role.is_system) !== 1 || currentUser.value?.role.isSystem === true)))

function isSelf(row: any): boolean { return row.uid === currentUserUid.value }
function canViewManagedUser(row: any): boolean { return Boolean(row?.uid) && Number(row.role_level ?? 0) <= currentRoleLevel.value && (Number(row.role_is_system) !== 1 || currentUser.value?.role.isSystem === true) }
function canManageUser(row: any): boolean { return canEdit.value && canViewManagedUser(row) }
function canManageRole(row: any): boolean {
  return Boolean(row?.uid) && canEdit.value && Number(row.is_system) !== 1 && row.uid !== currentRoleUid.value && Number(row.level) <= currentRoleLevel.value
}
function scopeValues(row: any): VisibilityScope[] {
  try { const value = JSON.parse(String(row.visibility_scopes ?? '[]')); return Array.isArray(value) ? value : [] }
  catch { return [] }
}
function visibleScopeValues(row: any): VisibilityScope[] { return scopeValues(row).slice(0, 2) }
function hiddenScopeCount(row: any): number { return Math.max(0, scopeValues(row).length - 2) }
function errorText(value: any, fallback: string): string { return value?.data?.error?.message ?? value?.message ?? fallback }

const permissionRole = ref('')
const permissionMatrix = reactive<Record<string, PermissionRow>>({})
const permissionSnapshot = ref('')
const permissionUpdatedAt = ref('')
const selectedRole = computed(() => data.roles.find((role: any) => role.uid === permissionRole.value) ?? null)
const permissionRows = computed(() => (data.modules as ModuleDefinition[]).map(module => ({ ...module, ...permissionMatrix[module.key] })))
const matrixDirty = computed(() => Boolean(permissionSnapshot.value) && permissionSnapshot.value !== JSON.stringify(permissionMatrix))
const matrixEditable = computed(() => Boolean(selectedRole.value && canManageRole(selectedRole.value) && Number(selectedRole.value.is_active) === 1))

function emptyPermissionRow(): PermissionRow { return { view: false, create: false, edit: false, delete: false, export: false } }
function buildMatrix(): void {
  for (const key of Object.keys(permissionMatrix)) delete permissionMatrix[key]
  for (const module of data.modules as ModuleDefinition[]) permissionMatrix[module.key] = emptyPermissionRow()
  for (const permission of data.permissions as any[]) {
    if (permission.role_uid !== permissionRole.value || !permissionMatrix[permission.module]) continue
    permissionMatrix[permission.module] = {
      view: Boolean(permission.can_view), create: Boolean(permission.can_create), edit: Boolean(permission.can_edit),
      delete: Boolean(permission.can_delete), export: Boolean(permission.can_export),
    }
  }
  permissionSnapshot.value = JSON.stringify(permissionMatrix)
  permissionUpdatedAt.value = String(selectedRole.value?.updated_at ?? '')
}
function canGrant(module: AuthModule, action: PermissionAction): boolean {
  return hasAdminPermission(currentUser.value, module, action)
}
function setPermission(module: AuthModule, action: PermissionAction, checked: boolean): void {
  const row = permissionMatrix[module]
  if (editor.busy.value || !row || !matrixEditable.value || !canGrant(module, action)) return
  row[action] = checked
  if (checked && action !== 'view') row.view = true
  if (!checked && action === 'view') for (const item of ACTIONS) row[item] = false
}
function rowAllChecked(module: AuthModule): boolean {
  const row = permissionMatrix[module]
  return Boolean(row && ACTIONS.filter(action => canGrant(module, action)).every(action => row[action]))
}
function setRowAll(module: AuthModule, checked: boolean): void {
  const row = permissionMatrix[module]
  if (editor.busy.value || !row || !matrixEditable.value) return
  for (const action of ACTIONS) if (canGrant(module, action)) row[action] = checked
  if (!row.view) for (const action of ACTIONS) row[action] = false
}
function actionAllChecked(action: PermissionAction): boolean {
  const modules = (data.modules as ModuleDefinition[]).filter(module => canGrant(module.key, action))
  return modules.length > 0 && modules.every(module => permissionMatrix[module.key]?.[action])
}
function setActionAll(action: PermissionAction, checked: boolean): void {
  if (editor.busy.value || !matrixEditable.value) return
  for (const module of data.modules as ModuleDefinition[]) if (canGrant(module.key, action)) setPermission(module.key, action, checked)
}
async function changePermissionRole(value: string): Promise<void> { await editor.run(() => changePermissionRoleImpl(value)) }
async function changePermissionRoleImpl(value: string): Promise<void> {
  if (value === permissionRole.value) return
  if (!await editor.confirmDiscard('当前权限矩阵尚未保存，确定切换角色吗？')) return
  permissionRole.value = value
  buildMatrix()
}

async function load(discardMatrix = false): Promise<void> {
  loading.value = true
  try {
    const value = await request<any>('/api/v1/admin/complete/auth/overview')
    Object.assign(data, value)
    const stillExists = data.roles.some((role: any) => role.uid === permissionRole.value)
    if (!stillExists && (!matrixDirty.value || discardMatrix)) permissionRole.value = data.roles.find((role: any) => canManageRole(role))?.uid ?? data.roles[0]?.uid ?? ''
    if (!matrixDirty.value || discardMatrix) buildMatrix()
    if ((userPage.value - 1) * userPageSize.value >= filteredUsers.value.length) userPage.value = 1
  } catch (value: any) { ElMessage.error(errorText(value, '账号权限数据读取失败')) }
  finally { loading.value = false }
}
async function refresh(): Promise<void> {
  await editor.run(async () => {
    if (await editor.confirmDiscard('刷新会放弃未保存的权限修改，确定继续吗？')) await load(true)
  })
}
function searchUsers(): void { userPage.value = 1 }
function setUserFilter(key: string, value: AdminListPrimitive | undefined): void { if (value === undefined) Reflect.deleteProperty(userColumnFilters, key); else userColumnFilters[key] = value; userPage.value = 1 }
function setRoleFilter(key: string, value: AdminListPrimitive | undefined): void { if (value === undefined) Reflect.deleteProperty(roleColumnFilters, key); else roleColumnFilters[key] = value }
function sortUsers(value: AdminUnifiedSortChange): void { if (!value.prop || !value.order) return; userSort.value = value.prop; userDirection.value = value.order === 'ascending' ? 'asc' : 'desc' }
function sortRoles(value: AdminUnifiedSortChange): void { if (!value.prop || !value.order) return; roleSort.value = value.prop; roleDirection.value = value.order === 'ascending' ? 'asc' : 'desc' }
function userRow(value: AdminUnifiedTableRow): any { return value }

const userOpen = ref(false)
const editingUser = ref<any>(null)
const userForm = reactive<any>({ uid: suggestedAdminUid('auth-users'), username: '', displayName: '', email: '', roleUid: '', status: 'active', mustChangePassword: 1, password: '', passwordConfirm: '', expectedUpdatedAt: '' })
const userBaseline = ref('')
const userDirty = computed(() => userOpen.value && userBaseline.value !== JSON.stringify(userForm))
const userUidValid = computed(() => ADMIN_UID_PATTERN.test(String(userForm.uid ?? '')))
function initializeNewUser(): void {
  editingUser.value = null
  Object.assign(userForm, { uid: suggestedAdminUid('auth-users'), username: '', displayName: '', email: '', roleUid: assignableRoles.value[0]?.uid ?? '', status: 'active', mustChangePassword: 1, password: '', passwordConfirm: '', expectedUpdatedAt: '' })
  userBaseline.value = JSON.stringify(userForm)
  userOpen.value = true
}
function openUserEditor(row: any): void {
  if (!canManageUser(row)) return
  editingUser.value = row
  Object.assign(userForm, { uid: row.uid, username: row.username, displayName: row.display_name, email: row.email ?? '', roleUid: row.role_uid, status: row.status, mustChangePassword: Number(row.must_change_password), password: '', passwordConfirm: '', expectedUpdatedAt: row.updated_at })
  userBaseline.value = JSON.stringify(userForm)
  userOpen.value = true
}
function newUser(): void { if (canCreate.value) void syncObjectQuery('users', 'new') }
function editUser(row: any): void { if (canManageUser(row)) void syncObjectQuery('users', row.uid) }
async function saveUser(andReturn = true): Promise<void> { await editor.run(() => saveUserImpl(andReturn)) }
async function saveUserImpl(andReturn = true): Promise<void> {
  if (editingUser.value ? !canManageUser(editingUser.value) : !canCreate.value) return
  if (!userUidValid.value) { ElMessage.warning('数据库 UID 格式无效'); return }
  if (!userForm.displayName.trim() || !userForm.roleUid) { ElMessage.warning('请填写显示名称并选择角色'); return }
  if (!editingUser.value) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(userForm.username)) { ElMessage.warning('账号需为 3–64 位字母、数字、点、下划线或短横线'); return }
    if ([...userForm.password.normalize('NFC')].length < 6) { ElMessage.warning('初始密码至少需要 6 个字符'); return }
    if (userForm.password !== userForm.passwordConfirm) { ElMessage.warning('两次输入的密码不一致'); return }
  }
  const wasEditing = Boolean(editingUser.value)
  const privilegeChanged = Boolean(editingUser.value && !isSelf(editingUser.value) && (editingUser.value.role_uid !== userForm.roleUid || editingUser.value.status !== userForm.status))
  if (privilegeChanged) {
    try { await ElMessageBox.confirm('修改角色或账号状态会立即撤销该用户的全部活动会话，确定继续吗？', '安全变更确认', { type: 'warning' }) }
    catch { return }
  }
  saving.value = true
  try {
    if (editingUser.value) {
      const body: Record<string, unknown> = {
        displayName: userForm.displayName, email: userForm.email, mustChangePassword: userForm.mustChangePassword,
        expectedUpdatedAt: userForm.expectedUpdatedAt,
      }
      if (!isSelf(editingUser.value)) Object.assign(body, { roleUid: userForm.roleUid, status: userForm.status })
      const result = await request<any>(`/api/v1/admin/complete/auth/users/${encodeURIComponent(editingUser.value.uid)}`, { method: 'PATCH', body })
      editingUser.value = result.user
      userForm.expectedUpdatedAt = result.user.updated_at
      if (isSelf(editingUser.value)) {
        try { await auth.load(true) } catch { ElMessage.warning('用户资料已保存，但当前账号信息刷新失败，请稍后刷新。') }
      }
    } else {
      const result = await request<any>('/api/v1/admin/complete/auth/users', { method: 'POST', body: { uid: userForm.uid, username: userForm.username, displayName: userForm.displayName, email: userForm.email, roleUid: userForm.roleUid, password: userForm.password } })
      editingUser.value = result.user
      Object.assign(userForm, { uid: result.user.uid, password: '', passwordConfirm: '', expectedUpdatedAt: result.user.updated_at, mustChangePassword: Number(result.user.must_change_password ?? 1) })
    }
    ElMessage.success(wasEditing ? '用户资料已保存' : '用户已创建；首次登录必须修改密码')
    userBaseline.value = JSON.stringify(userForm)
    editor.commit()
    if (andReturn) {
      userOpen.value = false
      await syncObjectQuery(null, null)
    } else await syncObjectQuery('users', editingUser.value.uid)
    await load()
  } catch (value: any) { ElMessage.error(errorText(value, '用户保存失败')) }
  finally { saving.value = false }
}

async function quickUserStatus(row: Parameters<typeof quickUserStatusImpl>[0], value: AdminListPrimitive): Promise<void> { await editor.run(() => quickUserStatusImpl(row, value)) }
async function quickUserStatusImpl(row: any, value: AdminListPrimitive): Promise<void> {
  if (!canManageUser(row) || isSelf(row) || row.status === value) return
  try {
    await ElMessageBox.confirm('修改账号状态会立即撤销该用户的全部活动会话，确定继续吗？', '安全变更确认', { type: 'warning' })
    saving.value = true
    await request(`/api/v1/admin/complete/auth/users/${encodeURIComponent(row.uid)}`, { method: 'PATCH', body: { status: value, expectedUpdatedAt: row.updated_at } })
    ElMessage.success('账号状态已更新')
    await load()
  } catch (failure: any) {
    if (failure !== 'cancel' && failure !== 'close' && failure?.message !== 'cancel') ElMessage.error(errorText(failure, '账号状态更新失败'))
  } finally { saving.value = false }
}

async function disableEditingUser(): Promise<void> { await editor.run(() => disableEditingUserImpl()) }
async function disableEditingUserImpl(): Promise<void> {
  const row = editingUser.value
  if (!row || isSelf(row) || !canManageUser(row) || row.status !== 'active') return
  try {
    await ElMessageBox.confirm(userDirty.value
      ? '禁用账号会立即撤销该用户的全部活动会话，并放弃当前未保存修改。确定继续吗？'
      : '禁用账号会立即撤销该用户的全部活动会话。确定继续吗？', '禁用账号', { type: 'warning', confirmButtonText: '禁用账号', cancelButtonText: '取消' })
    saving.value = true
    await request(`/api/v1/admin/complete/auth/users/${encodeURIComponent(row.uid)}`, { method: 'PATCH', body: { status: 'disabled', expectedUpdatedAt: row.updated_at } })
    userOpen.value = false
    editingUser.value = null
    editor.commit()
    await syncObjectQuery(null, null)
    ElMessage.success('账号已禁用，活动会话已撤销')
    await load()
  } catch (failure: any) {
    if (failure !== 'cancel' && failure !== 'close' && failure?.message !== 'cancel') ElMessage.error(errorText(failure, '账号禁用失败'))
  } finally { saving.value = false }
}

const resetOpen = ref(false)
const resetUser = ref<any>(null)
const resetForm = reactive({ password: '', confirm: '' })
function openReset(row: any): void {
  if (!canManageUser(row) || isSelf(row)) return
  resetUser.value = row
  Object.assign(resetForm, { password: '', confirm: '' })
  resetOpen.value = true
}
async function saveReset(): Promise<void> { await editor.run(() => saveResetImpl()) }
async function saveResetImpl(): Promise<void> {
  if ([...resetForm.password.normalize('NFC')].length < 6) { ElMessage.warning('新密码至少需要 6 个字符'); return }
  if (resetForm.password !== resetForm.confirm) { ElMessage.warning('两次输入的密码不一致'); return }
  saving.value = true
  try {
    await request(`/api/v1/admin/complete/auth/users/${encodeURIComponent(resetUser.value.uid)}/password`, { method: 'POST', body: { password: resetForm.password, expectedUpdatedAt: resetUser.value.updated_at } })
    ElMessage.success('密码已重置，全部活动会话已撤销')
    resetOpen.value = false
    await load()
  } catch (value: any) { ElMessage.error(errorText(value, '密码重置失败')) }
  finally { saving.value = false }
}

const roleOpen = ref(false)
const editingRole = ref<any>(null)
const roleForm = reactive<any>({ uid: suggestedAdminUid('auth-roles'), name: '', level: 0, description: '', visibilityScopes: ['public'], isActive: 1, sortOrder: 0, expectedUpdatedAt: '' })
const roleBaseline = ref('')
const roleDirty = computed(() => roleOpen.value && roleBaseline.value !== JSON.stringify(roleForm))
const roleUidValid = computed(() => ADMIN_UID_PATTERN.test(String(roleForm.uid ?? '')))
function initializeNewRole(): void {
  editingRole.value = null
  Object.assign(roleForm, { uid: suggestedAdminUid('auth-roles'), name: '', level: Math.max(0, currentRoleLevel.value - 100), description: '', visibilityScopes: ['public'], isActive: 1, sortOrder: 0, expectedUpdatedAt: '' })
  roleBaseline.value = JSON.stringify(roleForm)
  roleOpen.value = true
}
function openRoleEditor(row: any): void {
  if (!canManageRole(row)) return
  editingRole.value = row
  Object.assign(roleForm, { uid: row.uid, name: row.name, level: Number(row.level), description: row.description ?? '', visibilityScopes: scopeValues(row), isActive: Number(row.is_active), sortOrder: Number(row.sort_order), expectedUpdatedAt: row.updated_at })
  roleBaseline.value = JSON.stringify(roleForm)
  roleOpen.value = true
}
function newRole(): void { if (canCreate.value) void syncObjectQuery('roles', 'new') }
function editRole(row: any): void { if (canManageRole(row)) void syncObjectQuery('roles', row.uid) }
async function saveRole(andReturn = true): Promise<void> { await editor.run(() => saveRoleImpl(andReturn)) }
async function saveRoleImpl(andReturn = true): Promise<void> {
  if (editingRole.value ? !canManageRole(editingRole.value) : !canCreate.value) return
  if (!roleUidValid.value) { ElMessage.warning('数据库 UID 格式无效'); return }
  if (!roleForm.name.trim()) { ElMessage.warning('请填写角色名称'); return }
  if (!roleForm.visibilityScopes.length) { ElMessage.warning('请至少选择一个可见范围'); return }
  if (editingRole.value && (Number(editingRole.value.level) !== Number(roleForm.level) || Number(editingRole.value.is_active) !== Number(roleForm.isActive) || JSON.stringify(scopeValues(editingRole.value)) !== JSON.stringify(roleForm.visibilityScopes))) {
    try { await ElMessageBox.confirm('修改层级、可见范围或启用状态会撤销该角色用户的活动会话，确定继续吗？', '角色安全变更', { type: 'warning' }) }
    catch { return }
  }
  saving.value = true
  try {
    const body = { ...(!editingRole.value ? { uid: roleForm.uid } : {}), name: roleForm.name, level: roleForm.level, description: roleForm.description, visibilityScopes: roleForm.visibilityScopes, isActive: roleForm.isActive, sortOrder: roleForm.sortOrder, expectedUpdatedAt: roleForm.expectedUpdatedAt }
    const result = editingRole.value
      ? await request<any>(`/api/v1/admin/complete/auth/roles/${encodeURIComponent(editingRole.value.uid)}`, { method: 'PATCH', body })
      : await request<any>('/api/v1/admin/complete/auth/roles', { method: 'POST', body })
    editingRole.value = result.role
    roleForm.uid = result.role.uid
    roleForm.expectedUpdatedAt = result.role.updated_at
    ElMessage.success('角色已保存')
    roleBaseline.value = JSON.stringify(roleForm)
    editor.commit()
    if (andReturn) {
      roleOpen.value = false
      await syncObjectQuery(null, null)
    } else await syncObjectQuery('roles', editingRole.value.uid)
    await load()
  } catch (value: any) { ElMessage.error(errorText(value, '角色保存失败')) }
  finally { saving.value = false }
}
async function quickRoleStatus(row: Parameters<typeof quickRoleStatusImpl>[0], value: AdminListPrimitive): Promise<void> { await editor.run(() => quickRoleStatusImpl(row, value)) }
async function quickRoleStatusImpl(row: any, value: AdminListPrimitive): Promise<void> {
  if (!canManageRole(row) || Number(row.is_active) === Number(value)) return
  try {
    await ElMessageBox.confirm('修改角色启用状态会撤销该角色用户的活动会话，确定继续吗？', '角色安全变更', { type: 'warning' })
    saving.value = true
    await request(`/api/v1/admin/complete/auth/roles/${encodeURIComponent(row.uid)}`, { method: 'PATCH', body: { isActive: value, expectedUpdatedAt: row.updated_at } })
    ElMessage.success('角色状态已更新')
    await load()
  } catch (failure: any) {
    if (failure !== 'cancel' && failure !== 'close' && failure?.message !== 'cancel') ElMessage.error(errorText(failure, '角色状态更新失败'))
  } finally { saving.value = false }
}
async function deleteRole(row: Parameters<typeof deleteRoleImpl>[0]): Promise<void> { await editor.run(() => deleteRoleImpl(row)) }
async function deleteRoleImpl(row: any): Promise<boolean> {
  if (!canManageRole(row) || Number(row.user_count) > 0) return false
  try {
    await ElMessageBox.confirm(`确定删除空角色“${row.name}”吗？其权限矩阵也会一并删除。`, '删除角色', { type: 'warning', confirmButtonText: '删除' })
    saving.value = true
    await request(`/api/v1/admin/complete/auth/roles/${encodeURIComponent(row.uid)}?updatedAt=${encodeURIComponent(row.updated_at)}`, { method: 'DELETE' })
    if (editingRole.value?.uid === row.uid) { roleOpen.value = false; editingRole.value = null }
    editor.commit()
    ElMessage.success('角色已删除')
    await load()
    return true
  } catch (value: any) {
    if (value === 'cancel' || value === 'close' || value?.message === 'cancel') return false
    ElMessage.error(errorText(value, '角色删除失败'))
    return false
  } finally { saving.value = false }
}
async function reloadObject(kind: 'user' | 'role'): Promise<void> {
  await editor.run(async () => {
    const uid = kind === 'user' ? editingUser.value?.uid : editingRole.value?.uid
    if (!uid || !await editor.confirmDiscard('加载最新版本将放弃当前未保存修改，确定继续吗？')) return
    try {
      const value = await request<typeof data>('/api/v1/admin/complete/auth/overview')
      const row = (kind === 'user' ? value.users : value.roles).find((item: { uid: string }) => item.uid === uid)
      if (!row || !(kind === 'user' ? canManageUser(row) : canManageRole(row))) {
        ElMessage.warning('记录不存在或权限已变化，请返回列表后重新选择。')
        return
      }
      Object.assign(data, value)
      if (kind === 'user') openUserEditor(row)
      else openRoleEditor(row)
    } catch (failure) { ElMessage.error(errorText(failure, '最新账号权限信息读取失败，当前输入已保留')) }
  })
}
async function closeObjectEditor(_kind: 'user' | 'role'): Promise<void> { await syncObjectQuery(null, null) }
async function deleteEditingRole(): Promise<void> {
  await editor.run(async () => {
    if (editingRole.value && await deleteRoleImpl(editingRole.value)) await syncObjectQuery(null, null)
  })
}

async function syncObjectQuery(kind: 'users' | 'roles' | null, uid: string | null): Promise<void> {
  const targetTab = kind ?? (tab.value === 'roles' ? 'roles' : 'users')
  if ((uid ?? '') === editQueryUid.value && targetTab === editQueryTab.value) return
  const query = { ...route.query, tab: targetTab, edit: uid || undefined }
  await router.replace({ query })
}
function currentObjectQuery(): { tab: 'users' | 'roles'; uid: string } | null {
  if (userOpen.value) return { tab: 'users', uid: editingUser.value?.uid ?? 'new' }
  if (roleOpen.value) return { tab: 'roles', uid: editingRole.value?.uid ?? 'new' }
  return null
}
async function applyObjectQuery(): Promise<void> {
  const uid = editQueryUid.value
  const targetTab = editQueryTab.value
  tab.value = route.query.tab === 'permissions' ? 'permissions' : targetTab
  const current = currentObjectQuery()
  if (current?.tab === targetTab && current.uid === uid) return
  userOpen.value = false
  roleOpen.value = false
  editingUser.value = null
  editingRole.value = null
  if (!uid) return
  if (uid === 'new') {
    if (!canCreate.value) {
      await syncObjectQuery(null, null)
      ElMessage.warning('当前账号没有新建用户或角色的权限。')
      return
    }
    if (targetTab === 'roles') initializeNewRole()
    else initializeNewUser()
    return
  }
  const row = targetTab === 'roles'
    ? (data.roles as any[]).find(item => item.uid === uid)
    : (data.users as any[]).find(item => item.uid === uid)
  const manageable = row && (targetTab === 'roles' ? canManageRole(row) : canManageUser(row))
  if (!manageable) {
    await syncObjectQuery(null, null)
    ElMessage.warning('记录不存在，或当前账号无权编辑该对象。')
    return
  }
  if (targetTab === 'roles') openRoleEditor(row)
  else openUserEditor(row)
}

async function savePermissions(): Promise<void> { await editor.run(() => savePermissionsImpl()) }
async function savePermissionsImpl(): Promise<void> {
  if (!selectedRole.value || !matrixEditable.value || !matrixDirty.value) return
  saving.value = true
  try {
    const result = await request<{ roleUpdatedAt: string }>(`/api/v1/admin/complete/auth/roles/${encodeURIComponent(permissionRole.value)}/permissions`, { method: 'PUT', body: { permissions: permissionMatrix, expectedUpdatedAt: permissionUpdatedAt.value } })
    permissionSnapshot.value = JSON.stringify(permissionMatrix)
    permissionUpdatedAt.value = result.roleUpdatedAt
    editor.commit()
    ElMessage.success('权限矩阵已原子保存，相关用户会话已撤销')
    await load()
  } catch (value: any) { ElMessage.error(errorText(value, '权限保存失败')) }
  finally { saving.value = false }
}

const sessionOpen = ref(false)
const sessionLoading = ref(false)
const sessionUser = ref<any>(null)
const sessions = ref<any[]>([])
const selectedSessions = ref<any[]>([])
async function openSessions(row: any): Promise<void> {
  if (!canViewManagedUser(row)) return
  sessionUser.value = row
  sessionOpen.value = true
  sessionLoading.value = true
  selectedSessions.value = []
  try {
    const value = await request<any>(`/api/v1/admin/complete/auth/users/${encodeURIComponent(row.uid)}/sessions`)
    sessions.value = value.sessions ?? []
  } catch (value: any) { ElMessage.error(errorText(value, '活动会话读取失败')); sessions.value = [] }
  finally { sessionLoading.value = false }
}
async function revokeSessions(all: boolean): Promise<void> {
  if (!sessionUser.value || !canManageUser(sessionUser.value)) return
  const count = all ? sessions.value.length : selectedSessions.value.length
  if (!count) { ElMessage.info('没有可撤销的活动会话'); return }
  try {
    const selfWarning = isSelf(sessionUser.value) ? '；当前管理会话也可能立即失效' : ''
    await ElMessageBox.confirm(`将撤销 ${count} 个活动会话${selfWarning}，确定继续吗？`, '撤销会话', { type: 'warning' })
    sessionLoading.value = true
    const value = await request<any>(`/api/v1/admin/complete/auth/users/${encodeURIComponent(sessionUser.value.uid)}/sessions`, { method: 'POST', body: all ? { all: true } : { sessionUids: selectedSessions.value.map(row => row.uid) } })
    ElMessage.success(`已撤销 ${value.revoked} 个活动会话`)
    if (isSelf(sessionUser.value)) { auth.clear(); sessionOpen.value = false; await navigateTo('/zh/login'); return }
    await openSessions(sessionUser.value)
    await load()
  } catch (value: any) {
    if (value === 'cancel' || value?.message === 'cancel') return
    ElMessage.error(errorText(value, '会话撤销失败'))
  } finally { sessionLoading.value = false }
}

const anyDirty = computed(() => matrixDirty.value || userDirty.value || roleDirty.value)
const editor = useAdminEditorLifecycle({ dirty: () => anyDirty.value, busy: () => saving.value })
async function changeTab(value: string | number): Promise<boolean> {
  if (String(value) === tab.value) return true
  await router.replace({ query: { ...route.query, tab: String(value), edit: undefined } })
  await nextTick()
  return tab.value === String(value)
}
watch(() => [route.query.edit, route.query.tab] as const, () => {
  if (matrixDirty.value) buildMatrix()
  void applyObjectQuery()
})
onMounted(async () => { await load(); await applyObjectQuery() })
</script>

<template>
  <AdminEditorShell
    v-if="userOpen"
    eyebrow="账号权限"
    :title="editingUser ? '编辑用户' : '新建用户'"
    description="维护登录身份、角色、账号状态和密码策略。"
    :sections="[{ id: 'auth-user-uid', label: '数据库 UID' }, { id: 'auth-user-identity', label: '身份信息' }, { id: 'auth-user-security', label: '角色与安全' }]"
    :dirty="userDirty"
    :saving="saving"
    :busy="editor.busy.value"
    :save-disabled="!userDirty || !userUidValid"
    @back="closeObjectEditor('user')"
    @save="saveUser(false)"
    @save-and-return="saveUser(true)"
  >
    <template #header-actions><ElButton v-if="editingUser" plain @click="reloadObject('user')">加载最新版本</ElButton></template>
    <ElAlert v-if="editingUser && isSelf(editingUser)" title="可修改自己的显示名称、邮箱与改密标记；角色和状态由其他管理员维护。" type="info" show-icon :closable="false" />
    <ElForm label-position="top" class="object-editor-form" @submit.prevent="saveUser(false)">
      <AdminIdentitySection v-model="userForm.uid" resource="auth-users" :existing="Boolean(editingUser)" section-id="auth-user-uid" />
      <section id="auth-user-identity" class="admin-form-section"><header><div><small>编辑分组</small><h2>身份信息</h2></div></header><div class="admin-form-grid">
        <AdminCheckedFormItem label="登录账号" required resource="auth-users" field="username" :value="userForm.username" :exclude-uid="editingUser?.uid ?? null"><ElInput v-model="userForm.username" :disabled="Boolean(editingUser)" maxlength="64" autocomplete="off" placeholder="例如：zhangsan" /><p class="admin-field-help">用于登录后台，创建后不可修改；最多 64 个字符。</p></AdminCheckedFormItem>
        <AdminFormItem label="显示名称" required><ElInput v-model="userForm.displayName" maxlength="200" placeholder="请输入用户显示名称" /><p class="admin-field-help">显示在后台操作记录和账号信息中，最多 200 个字符。</p></AdminFormItem>
        <AdminFormItem label="邮箱"><ElInput v-model="userForm.email" type="email" maxlength="320" placeholder="例如：name@example.com" /><p class="admin-field-help">用于账号识别与通知；可选，须填写完整邮箱地址。</p></AdminFormItem>
        <AdminFormItem label="角色" required><ElSelect v-model="userForm.roleUid" :disabled="Boolean(editingUser && isSelf(editingUser))" filterable placeholder="请选择用户角色"><ElOption v-for="role in assignableRoles" :key="role.uid" :label="`${role.name}（层级 ${role.level}）`" :value="role.uid" /></ElSelect><p class="admin-field-help">角色决定该账号可访问和可操作的后台模块。</p></AdminFormItem>
      </div></section>
      <section id="auth-user-security" class="admin-form-section"><header><div><small>编辑分组</small><h2>角色与安全</h2></div></header><div class="admin-form-grid">
        <template v-if="!editingUser"><AdminFormItem label="初始密码" required><ElInput v-model="userForm.password" type="password" show-password autocomplete="new-password" placeholder="请输入至少 6 个字符的初始密码" /><p class="admin-field-help">至少 6 个字符；首次登录后必须修改。</p></AdminFormItem><AdminFormItem label="确认初始密码" required><ElInput v-model="userForm.passwordConfirm" type="password" show-password autocomplete="new-password" placeholder="请再次输入初始密码" /><p class="admin-field-help">必须与初始密码完全一致，用于避免录入错误。</p></AdminFormItem><ElAlert class="is-wide" title="密码至少 6 个字符；用户首次登录必须改密。" type="info" :closable="false" /></template>
        <template v-else><AdminFormItem label="账号状态"><ElSelect v-model="userForm.status" :disabled="isSelf(editingUser)" placeholder="请选择账号状态"><ElOption label="启用" value="active" /><ElOption label="禁用" value="disabled" /><ElOption label="锁定" value="locked" /></ElSelect><p class="admin-field-help">禁用或锁定会阻止该账号继续登录。</p></AdminFormItem><AdminFormItem label="下次登录必须改密"><ElSwitch v-model="userForm.mustChangePassword" :active-value="1" :inactive-value="0" /><p class="admin-field-help">启用后，用户下次登录必须先设置新密码。</p></AdminFormItem></template>
      </div></section>
    </ElForm>
    <template #record-meta><span v-if="editingUser">更新于 {{ formatTime(editingUser.updated_at) }}</span><span v-else>UID 已生成建议值，首次保存前可以自定义。</span><ElTag v-if="userDirty" type="warning" effect="light">有未保存修改</ElTag></template>
    <template #danger-actions><ElButton v-if="editingUser && !isSelf(editingUser) && canManageUser(editingUser) && editingUser.status === 'active'" type="danger" plain :loading="saving" @click="disableEditingUser">禁用账号</ElButton></template>
  </AdminEditorShell>

  <AdminEditorShell
    v-else-if="roleOpen"
    eyebrow="账号权限"
    :title="editingRole ? '编辑角色' : '新建角色'"
    description="维护角色层级、内容可见范围、启用状态和显示顺序。"
    :sections="[{ id: 'auth-role-uid', label: '数据库 UID' }, { id: 'auth-role-basic', label: '角色信息' }, { id: 'auth-role-policy', label: '范围与状态' }]"
    :dirty="roleDirty"
    :saving="saving"
    :busy="editor.busy.value"
    :save-disabled="!roleDirty || !roleUidValid"
    @back="closeObjectEditor('role')"
    @save="saveRole(false)"
    @save-and-return="saveRole(true)"
  >
    <template #header-actions><ElButton v-if="editingRole" plain @click="reloadObject('role')">加载最新版本</ElButton></template>
    <ElForm label-position="top" class="object-editor-form" @submit.prevent="saveRole(false)">
      <AdminIdentitySection v-model="roleForm.uid" resource="auth-roles" :existing="Boolean(editingRole)" section-id="auth-role-uid" />
      <section id="auth-role-basic" class="admin-form-section"><header><div><small>编辑分组</small><h2>角色信息</h2></div></header><div class="admin-form-grid">
        <AdminCheckedFormItem label="角色名称" required resource="auth-roles" field="name" :value="roleForm.name" :exclude-uid="editingRole?.uid ?? null"><ElInput v-model="roleForm.name" maxlength="100" placeholder="请输入角色名称" /><p class="admin-field-help">用于分配和识别权限角色，最多 100 个字符。</p></AdminCheckedFormItem>
        <AdminFormItem label="权限层级" required><ElInputNumber v-model="roleForm.level" :min="0" :max="currentRoleLevel" /><p class="admin-field-help">数值越高权限层级越高，不能超过当前管理员层级。</p></AdminFormItem>
        <AdminFormItem class="is-wide" label="角色说明"><ElInput v-model="roleForm.description" type="textarea" :rows="4" maxlength="2000" show-word-limit placeholder="简要说明角色职责和适用对象" /><p class="admin-field-help">帮助管理员区分角色用途，最多 2000 个字符。</p></AdminFormItem>
      </div></section>
      <section id="auth-role-policy" class="admin-form-section"><header><div><small>编辑分组</small><h2>范围与状态</h2></div></header><div class="admin-form-grid">
        <AdminFormItem class="is-wide" label="内容可见范围" required><ElCheckboxGroup v-model="roleForm.visibilityScopes" class="scope-picker"><ElCheckbox v-for="(label, scope) in SCOPE_LABELS" :key="scope" :value="scope">{{ label }}</ElCheckbox></ElCheckboxGroup><p class="admin-field-help">决定该角色可查看哪些可见性级别的内容，至少选择一项。</p></AdminFormItem>
        <AdminFormItem label="启用角色"><ElSwitch v-model="roleForm.isActive" :active-value="1" :inactive-value="0" /><p class="admin-field-help">停用后，该角色不再用于正常的后台访问。</p></AdminFormItem>
        <AdminFormItem label="排序"><ElInputNumber v-model="roleForm.sortOrder" :min="-1000000" :max="1000000" /><p class="admin-field-help">数值越小，在角色列表和选择器中越靠前。</p></AdminFormItem>
      </div></section>
    </ElForm>
    <template #record-meta><span v-if="editingRole">更新于 {{ formatTime(editingRole.updated_at) }}</span><span v-else>UID 已生成建议值，首次保存前可以自定义。</span><ElTag v-if="roleDirty" type="warning" effect="light">有未保存修改</ElTag></template>
    <template #danger-actions><ElButton v-if="editingRole && canManageRole(editingRole) && Number(editingRole.user_count) === 0" type="danger" plain @click="deleteEditingRole">删除角色</ElButton></template>
  </AdminEditorShell>

  <section v-else class="auth-page">
    <AdminPageHeader eyebrow="系统管理" title="用户、角色与权限" description="维护后台账号、角色层级、内容可见范围、模块权限和活动会话。所有安全变更都会记入操作日志。">
      <template #actions><ElButton :loading="loading" @click="refresh">刷新</ElButton></template>
    </AdminPageHeader>

    <div class="admin-metric-grid auth-metrics">
      <article class="admin-metric-card"><small>用户总数</small><strong>{{ data.metrics.users ?? 0 }}</strong><p>{{ data.metrics.activeUsers ?? 0 }} 个账号已启用</p></article>
      <article class="admin-metric-card"><small>受限账号</small><strong>{{ data.metrics.restrictedUsers ?? 0 }}</strong><p>包括禁用与锁定状态</p></article>
      <article class="admin-metric-card"><small>启用角色</small><strong>{{ data.metrics.activeRoles ?? 0 }}</strong><p>系统角色受到额外保护</p></article>
      <article class="admin-metric-card"><small>活动会话</small><strong>{{ data.metrics.activeSessions ?? 0 }}</strong><p>可按用户查看与撤销</p></article>
    </div>

    <ElAlert v-if="!canEdit" title="当前账号拥有查看权限；用户、角色、权限与会话修改需要编辑权限。" type="info" show-icon :closable="false" />

    <ElTabs v-loading="loading" :model-value="tab" type="border-card" class="auth-tabs" :before-leave="changeTab">
      <ElTabPane label="用户账号" name="users">
        <AdminListToolbar v-model="userFilters.q" :selected-count="selectedUsers.length" search-placeholder="搜索账号、姓名或邮箱" @search="searchUsers" @refresh="refresh"><template #actions><ElButton v-if="canCreate" type="primary" @click="newUser">新建用户</ElButton></template></AdminListToolbar>
        <AdminDataTable :rows="visibleUsers" :columns="userColumns" :loading="loading" :selectable="canEdit" :filter-values="userColumnFilters" :action-labels="['编辑', '会话', '重置密码']" preference-key="complete:auth-users" empty-description="没有符合条件的用户" @selection-change="selectedUsers = $event" @sort-change="sortUsers" @filter-change="setUserFilter">
          <template #cell="{ row, column }">
            <div v-if="column.key === 'username'" class="primary-cell"><strong>{{ row.username }}</strong><ElTag v-if="isSelf(row)" size="small" effect="plain">当前账号</ElTag></div>
            <span v-else-if="column.key === 'email'" class="admin-two-line-cell">{{ row.email || '—' }}</span>
            <template v-else-if="column.key === 'role_name'"><span>{{ row.role_name || row.role_uid }}</span><small class="subline">层级 {{ row.role_level }}</small></template>
            <AdminQuickField v-else-if="column.key === 'status' && canManageUser(row) && !isSelf(row)" :model-value="row.status as AdminListPrimitive" :options="column.options ?? []" kind="status" :loading="saving" :aria-label="`快速修改${column.label}`" @change="value => quickUserStatus(userRow(row), value)" />
            <ElTag v-else-if="column.key === 'status'" :type="STATUS_TYPES[row.status as UserStatus]">{{ STATUS_LABELS[row.status as UserStatus] }}</ElTag>
            <ElTag v-else-if="column.key === 'must_change_password'" :type="row.must_change_password ? 'warning' : 'success'" size="small" effect="plain">{{ row.must_change_password ? '待修改' : '正常' }}</ElTag>
            <template v-else-if="column.key === 'last_login_at'">{{ formatTime(row.last_login_at) }}</template>
            <template v-else>{{ row[column.key] ?? '—' }}</template>
          </template>
          <template #actions="{ row }"><AdminRowActions><ElButton size="small" plain type="primary" :disabled="!canManageUser(row)" @click="editUser(userRow(row))">编辑</ElButton><ElButton size="small" plain :disabled="!canViewManagedUser(row)" @click="openSessions(userRow(row))">会话</ElButton><ElButton size="small" plain type="warning" :disabled="!canManageUser(row) || isSelf(row)" @click="openReset(userRow(row))">重置密码</ElButton></AdminRowActions></template>
        </AdminDataTable>
        <div class="pagination"><span>共 {{ filteredUsers.length }} 个用户</span><ElPagination v-model:current-page="userPage" v-model:page-size="userPageSize" layout="sizes, prev, pager, next" :page-sizes="[10,20,50,100]" :total="filteredUsers.length" /></div>
      </ElTabPane>

      <ElTabPane label="角色" name="roles">
        <AdminListToolbar v-model="roleQuery" :selected-count="selectedRoles.length" search-placeholder="搜索角色名称或说明" @search="() => undefined" @refresh="refresh"><template #actions><ElButton v-if="canCreate" type="primary" @click="newRole">新建角色</ElButton></template></AdminListToolbar>
        <AdminDataTable :rows="visibleRoles" :columns="roleColumns" :loading="loading" :selectable="canEdit" :filter-values="roleColumnFilters" :action-labels="['编辑', '删除']" preference-key="complete:auth-roles" empty-description="暂无角色" @selection-change="selectedRoles = $event" @sort-change="sortRoles" @filter-change="setRoleFilter">
          <template #cell="{ row, column }">
            <template v-if="column.key === 'name'"><div class="primary-cell"><strong>{{ row.name }}</strong><ElTag v-if="row.is_system" type="warning" size="small">系统角色</ElTag><ElTag v-else-if="row.uid === currentRoleUid" size="small" effect="plain">当前角色</ElTag></div><small class="subline admin-one-line-cell">{{ row.description || '暂无说明' }}</small></template>
            <div v-else-if="column.key === 'visibility_scopes'" class="tag-list"><ElTag v-for="scope in visibleScopeValues(row)" :key="scope" size="small" effect="plain">{{ SCOPE_LABELS[scope] }}</ElTag><ElTag v-if="hiddenScopeCount(row)" size="small" type="info" effect="plain">+{{ hiddenScopeCount(row) }}</ElTag></div>
            <AdminQuickField v-else-if="column.key === 'is_active' && canManageRole(row)" :model-value="row.is_active as AdminListPrimitive" :options="column.options ?? []" kind="boolean" :loading="saving" :aria-label="`快速修改${column.label}`" @change="value => quickRoleStatus(userRow(row), value)" />
            <ElTag v-else-if="column.key === 'is_active'" :type="row.is_active ? 'success' : 'danger'">{{ row.is_active ? '启用' : '停用' }}</ElTag>
            <template v-else-if="column.key === 'updated_at'">{{ formatTime(row.updated_at) }}</template>
            <template v-else>{{ row[column.key] ?? '—' }}</template>
          </template>
          <template #actions="{ row }"><AdminRowActions><ElButton size="small" plain type="primary" :disabled="!canManageRole(row)" @click="editRole(userRow(row))">编辑</ElButton><ElButton size="small" plain type="danger" :disabled="!canManageRole(row) || Number(row.user_count) > 0" @click="deleteRole(userRow(row))">删除</ElButton></AdminRowActions></template>
        </AdminDataTable>
        <p class="help">系统角色、当前角色和更高层级角色不可修改；仍被用户引用的角色不可删除，可先停用或迁移用户。</p>
      </ElTabPane>

      <ElTabPane label="权限矩阵" name="permissions">
        <div class="permission-head">
          <ElSelect :model-value="permissionRole" filterable placeholder="选择角色" class="role-select" :disabled="editor.busy.value" @change="changePermissionRole"><ElOption v-for="role in data.roles" :key="role.uid" :label="`${role.name}（层级 ${role.level}）`" :value="role.uid" /></ElSelect>
          <ElTag v-if="selectedRole?.is_system" type="warning">系统角色只读</ElTag><ElTag v-else-if="selectedRole?.uid === currentRoleUid" type="warning">当前角色只读</ElTag><ElTag v-else-if="selectedRole && !selectedRole.is_active" type="info">角色已停用</ElTag>
          <span v-if="matrixDirty" class="dirty">有未保存修改</span>
          <ElButton type="primary" :loading="saving" :disabled="editor.busy.value || !matrixEditable || !matrixDirty" @click="savePermissions">保存权限矩阵</ElButton>
        </div>
        <ElAlert title="创建、编辑、删除或导出权限必须同时拥有查看权限；你不能向其他角色授予自己没有的能力。保存采用角色版本校验，并会撤销该角色的活动会话。" type="info" show-icon :closable="false" />
        <ElTable :data="permissionRows" border size="small" class="permission-table admin-overview-table">
          <ElTableColumn label="模块" min-width="260" fixed="left"><template #default="{ row }"><strong>{{ row.title }}</strong><small class="subline">{{ row.description }}</small></template></ElTableColumn>
          <ElTableColumn label="整行" width="74" align="center"><template #header><span>整行</span></template><template #default="{ row }"><ElCheckbox :model-value="rowAllChecked(row.key)" :disabled="editor.busy.value || !matrixEditable" aria-label="选择整行权限" @change="setRowAll(row.key, Boolean($event))" /></template></ElTableColumn>
          <ElTableColumn v-for="action in ACTIONS" :key="action" width="88" align="center">
            <template #header><div class="permission-header"><span>{{ ACTION_LABELS[action] }}</span><ElCheckbox :model-value="actionAllChecked(action)" :disabled="editor.busy.value || !matrixEditable" :aria-label="`全选${ACTION_LABELS[action]}权限`" @change="setActionAll(action, Boolean($event))" /></div></template>
            <template #default="{ row }"><ElCheckbox :model-value="Boolean(permissionMatrix[row.key]?.[action])" :disabled="editor.busy.value || !matrixEditable || !canGrant(row.key, action)" :aria-label="`${row.title}${ACTION_LABELS[action]}权限`" @change="setPermission(row.key, action, Boolean($event))" /></template>
          </ElTableColumn>
        </ElTable>
      </ElTabPane>
    </ElTabs>

    <ElDialog v-model="resetOpen" title="重置用户密码" width="min(540px,94vw)" destroy-on-close>
      <ElAlert :title="`将重置 ${resetUser?.username || ''} 的密码，撤销全部活动会话，并要求下次登录修改密码。`" type="warning" show-icon :closable="false" />
      <ElForm label-position="top" class="dialog-form"><AdminFormItem label="新密码" required><ElInput v-model="resetForm.password" type="password" show-password autocomplete="new-password" placeholder="请输入至少 6 个字符的新密码" /><p class="admin-field-help">至少 6 个字符；保存后会撤销现有会话。</p></AdminFormItem><AdminFormItem label="确认新密码" required><ElInput v-model="resetForm.confirm" type="password" show-password autocomplete="new-password" placeholder="请再次输入新密码" /><p class="admin-field-help">必须与新密码完全一致。</p></AdminFormItem></ElForm>
      <template #footer><ElButton @click="resetOpen = false">取消</ElButton><ElButton type="primary" :loading="saving" @click="saveReset">重置密码</ElButton></template>
    </ElDialog>

    <ElDialog v-model="sessionOpen" :title="`${sessionUser?.username || ''} 的活动会话`" width="min(780px,96vw)" destroy-on-close>
      <div v-if="canEdit" class="session-actions"><span>仅显示仍在有效期内的活动会话，不展示令牌或完整设备指纹。</span><div><ElButton :disabled="!selectedSessions.length" @click="revokeSessions(false)">撤销所选</ElButton><ElButton type="danger" plain :disabled="!sessions.length" @click="revokeSessions(true)">撤销全部</ElButton></div></div>
      <ElTable v-loading="sessionLoading" :data="sessions" class="admin-overview-table" border size="small" empty-text="当前没有活动会话" @selection-change="selectedSessions = $event"><ElTableColumn v-if="canEdit" type="selection" width="46" /><ElTableColumn label="设备摘要" min-width="145"><template #default="{ row }">{{ row.device_fingerprint ? `设备 ${row.device_fingerprint}` : '未知设备' }}</template></ElTableColumn><ElTableColumn label="创建时间" min-width="170"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></ElTableColumn><ElTableColumn label="最近活动" min-width="170"><template #default="{ row }">{{ formatTime(row.last_seen_at) }}</template></ElTableColumn><ElTableColumn label="最长有效期" min-width="170"><template #default="{ row }">{{ formatTime(row.expires_at) }}</template></ElTableColumn></ElTable>
    </ElDialog>
  </section>
</template>

<style scoped>
.auth-page{display:grid;gap:1rem}.auth-metrics{margin-bottom:.2rem}.auth-tabs{min-width:0}.permission-head,.session-actions{display:flex;align-items:center;gap:.65rem;flex-wrap:wrap;margin-bottom:1rem}.primary-cell,.tag-list{min-width:0;display:flex;align-items:center;gap:.35rem;flex-wrap:nowrap;overflow:hidden}.primary-cell strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.primary-cell .el-tag,.tag-list .el-tag{flex:none}.subline{display:block;margin-top:.12rem;color:var(--admin-muted);font-size:.71rem}.pagination{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-top:1rem;color:var(--admin-muted);font-size:.78rem}.help{margin-top:.8rem;color:var(--admin-muted);font-size:.78rem}.permission-head .role-select{width:min(22rem,100%)}.permission-head .dirty{color:var(--admin-warning);font-size:.78rem;font-weight:700}.permission-head>.el-button{margin-left:auto}.permission-table{margin-top:1rem}.permission-header{display:grid;place-items:center;gap:.25rem}.dialog-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 .9rem;margin-top:1rem}.dialog-form>.el-alert,.dialog-form>.el-form-item:has(textarea),.dialog-form>.el-form-item:has(.scope-picker){grid-column:1/-1}.dialog-form .el-select,.dialog-form .el-input-number{width:100%}.scope-picker{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.2rem}.session-actions{justify-content:space-between;color:var(--admin-muted);font-size:.76rem}.session-actions>div{display:flex;gap:.5rem}@media(max-width:760px){.dialog-form{grid-template-columns:1fr}.dialog-form>*{grid-column:1!important}.pagination,.session-actions{align-items:flex-start;flex-direction:column}.permission-head>.el-button{margin-left:0}.scope-picker{grid-template-columns:1fr}}
</style>
