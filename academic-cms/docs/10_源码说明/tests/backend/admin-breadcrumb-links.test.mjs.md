# tests / backend / admin-breadcrumb-links.test.mjs

## 文件定位

- **源码路径**：`tests/backend/admin-breadcrumb-links.test.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：38 行，1977 字节
- **内容校验**：SHA-256 `943a2e7f76516f9330baf336e2076cf0e9ce0bec6aedb0d1a67fb9c33fb0a554`

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `source` | 函数变量，第 7 行 | 封装 source 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |

### 调用签名

- `source`：`source = relative => readFile(resolve(root, relative), 'utf8')`

## 测试场景

- 第 9 行：`test` — 后台面包屑由注册表集中生成并接收当前权限主体
- 第 22 行：`test` — 专项子页与页内编辑状态均有独立的末级面包屑
- 第 32 行：`test` — 面包屑组件只给最后当前项设置 aria-current，中间项使用站内链接

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
