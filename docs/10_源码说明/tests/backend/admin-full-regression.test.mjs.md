# tests / backend / admin-full-regression.test.mjs

## 文件定位

- **源码路径**：`tests/backend/admin-full-regression.test.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：191 行，10374 字节
- **内容校验**：SHA-256 `e37f6bab1ff7c07b2eef3c59db388e80a7e9477f54ee3e3418eed7b38f327a0b`

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `source` | 函数变量，第 7 行 | 封装 source 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 21 次。 |
| `registryRows` | 函数，第 31 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `source`：`source = relative => readFile(resolve(root, relative), 'utf8')`
- `registryRows`：`function registryRows(text)`

## 测试场景

- 第 36 行：`test` — 侧边栏唯一注册表完整覆盖 19 个正式模块且没有重复项
- 第 45 行：`test` — 19 个正式路径都由显式页面或通用内容工作台承接
- 第 72 行：`test` — 列表、新建、编辑、删除、批量更新按钮均有服务端处理入口
- 第 93 行：`test` — 显式资源页和五个专项页都挂载真实工作台及对应 API
- 第 111 行：`test` — 权限导航、页面守卫和连通性接口复用正式注册表
- 第 124 行：`test` — 权限不足统一保留 403 并显示权限弹窗
- 第 139 行：`test` — Element Plus 模板组件全部使用 PascalCase 并显式导入
- 第 152 行：`test` — 历史兼容路由及归一化中间件已物理删除
- 第 159 行：`test` — 公开富文本不再通过 v-html 执行存储内容
- 第 170 行：`test` — 完整后台数据库入口复用平台适配器且不会把原生 SQLite 打进 Worker
- 第 178 行：`test` — H3 长错误说明使用 message 而不是 statusMessage

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
