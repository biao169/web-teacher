# tests / backend / admin-completeness.test.mjs

## 文件定位

- **源码路径**：`tests/backend/admin-completeness.test.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：115 行，5464 字节
- **内容校验**：SHA-256 `074b6b4a3ff5686396aec634dddcefa6c7aeaeaca7c79cd4074076fcdd26f262`

## 直接依赖

- `node:assert/strict`
- `node:fs`
- `node:path`
- `node:test`
- `node:url`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `read` | 函数变量，第 8 行 | 读取或定位 read，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 8 次。 |
| `exists` | 函数变量，第 9 行 | 封装 exists 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 8 次。 |
| `walk` | 函数变量，第 10 行 | 封装 walk 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `routeEvidence` | 函数，第 48 行 | 封装 Evidence 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `apiEvidence` | 函数，第 56 行 | 封装 Evidence 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `read`：`read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')`
- `exists`：`exists = (relative) => fs.existsSync(path.join(root, relative))`
- `walk`：`walk = (dir) =>`
- `routeEvidence`：`function routeEvidence(route)`
- `apiEvidence`：`function apiEvidence(key)`

## 测试场景

- 第 65 行：`test` — 每个后台功能具有页面、权限和 API 证据
- 第 74 行：`test` — 后台正式页面不包含未接通占位内容
- 第 86 行：`test` — 后台仅保留正式路由，不再提供历史兼容页面
- 第 94 行：`test` — 翻译建议响应同时支持 values 与兼容字段
- 第 103 行：`test` — 0008 完整性迁移存在且包含三项唯一约束
- 第 110 行：`test` — 后台 Vue 页面不使用不受控 v-html

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
