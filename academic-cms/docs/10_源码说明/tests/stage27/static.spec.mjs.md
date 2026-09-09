# tests / stage27 / static.spec.mjs

## 文件定位

- **源码路径**：`tests/stage27/static.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：99 行，4795 字节
- **内容校验**：SHA-256 `5b89d485f6994f490447b81afa509e6a7ff70b43214b52806e68ee2f4dd2121b`

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `text` | 函数变量 | 封装 text 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 15 次。 |
| `walk` | 内部函数 | 封装 walk 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `text`：`text = path => readFile(resolve(root, path), 'utf8')`
- `walk`：`async function walk(path)`

## 测试场景

- 第 9 行：`test` — the dynamic admin page renders list and editor workspaces
- 第 18 行：`test` — core content modules are marked implemented in the admin registry
- 第 25 行：`test` — the client enforces server pagination, bounded selection and optimistic versions
- 第 36 行：`test` — content API exposes one unambiguous route set
- 第 52 行：`test` — list SQL requests only the visible projection
- 第 59 行：`test` — admin content Vue templates never render raw HTML
- 第 67 行：`test` — list and editor keep selection, nullable fields and navigation state coherent
- 第 82 行：`test` — client route guard requires create permission for new content routes
- 第 90 行：`test` — content writes use operation-specific bounded payload budgets

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。

## 本轮回归说明

2026-09-06：改用共享控件路径或增加统一标题结构/几何断言。浏览器工作流类型检查通过，实际浏览器运行仍待完成。
