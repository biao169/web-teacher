# app/components/admin/complete/AdminCompleteAuthWorkspace.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteAuthWorkspace.vue`
- **功能定位**：既有用户、角色和权限管理页面；创建用户、重置密码的长度判断及中文说明改为至少6个字符，保留确认密码和强制改密流程。
- **规模**：697 行，58130 字节
- **内容校验**：SHA-256 `7c5c306ed22cbcb5d01cb4591f1c1c3e5f2fcda669daac277fdb0dc1da18d2e3`

## 使用与维护

既有用户、角色和权限管理页面；创建用户、重置密码的长度判断及中文说明改为至少6个字符，保留确认密码和强制改密流程。

## 直接依赖

- `~/composables/useAdminEditorLifecycle`
- `../shared/AdminFormItem.vue`
- `element-plus`
- `~/admin/element-plus-ts6`
- `~/admin/formatters`
- `~/admin/unified-list`
- `~~/shared/admin/registry`
- `~~/shared/admin/identity`
- `~~/shared/contracts/auth`
- `~~/shared/enums/auth`
- `../shared/AdminDataTable.vue`
- `../shared/AdminListToolbar.vue`
- `../shared/AdminQuickField.vue`
- `../shared/AdminRowActions.vue`
- `../shared/AdminEditorShell.vue`
- `../shared/AdminCheckedFormItem.vue`
- `../shared/AdminIdentitySection.vue`

本轮实现与验证详见 `docs/45_顶部账号按钮与六位密码.md`。
