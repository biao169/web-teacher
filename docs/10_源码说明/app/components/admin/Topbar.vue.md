# app / components / admin / Topbar.vue

## 文件定位

- **源码路径**：`app/components/admin/Topbar.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台界面组件；构成后台导航、标题栏、状态反馈或内容管理交互。
- **规模**：41 行，3272 字节
- **内容校验**：SHA-256 `c665307156681f19e74d22286d7f16cce3eba565706f461f4d08261e1adb31d7`

## 直接依赖

- `@lucide/vue`
- `element-plus`
- `~/admin/query-client`
- `~~/shared/admin/paths`
- `~~/shared/admin/registry`
- `~~/shared/contracts/auth`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `accountLabel` | computed 声明，第 10 行 | 派生 account Label 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `initials` | computed 声明，第 11 行 | 派生 initials 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `logout` | 函数，第 12 行 | 封装 logout 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `handleCommand` | 函数，第 18 行 | 响应 Command 相关事件，协调后续业务流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `accountLabel`：`accountLabel = computed(() => props.user?.displayName || props.user?.username || '账号')`
- `initials`：`initials = computed(() => accountLabel.value.trim().slice(0,1).toUpperCase() || 'A')`
- `logout`：`async function logout(): Promise<void>`
- `handleCommand`：`function handleCommand(command: string): void`

## Vue 模板交互

- 模板约 13 行；样式区约 0 行。
- 子组件：`ElButton`、`Menu`、`AdminBreadcrumbs`、`ExternalLink`、`ElDropdown`、`ElDropdownMenu`、`ElDropdownItem`、`KeyRound`、`MonitorCog`、`LogOut`、`UserRound`
- 事件绑定：`click → emit(`、`command → handleCommand`
- 动态属性：`size`、`items`、`aria-label`、`disabled`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
