# tests / stage26 / registry.spec.mjs

## 文件定位

- **源码路径**：`tests/stage26/registry.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：64 行，5930 字节
- **内容校验**：SHA-256 `ac2ac9ba83d79e9c5fb2a04f190b445564e7cbfeee58c9f86024fa61ab73a39a`

## 直接依赖

- `node:assert/strict`
- `node:module`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `userWith` | 函数，第 7 行 | 封装 With 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |

### 调用签名

- `userWith`：`function userWith(modules,mustChangePassword=false)`

## 测试场景

- 第 8 行：`test` — registry covers every auth module exactly once
- 第 9 行：`test` — route resolution uses exact dashboard and bounded prefixes
- 第 10 行：`test` — navigation is permission-aware and forced-password users see no modules
- 第 11 行：`test` — breadcrumb groups link to the canonical or first permitted module
- 第 21 行：`test` — breadcrumbs distinguish content editors and specialist child pages
- 第 41 行：`test` — breadcrumbs recognize canonical in-page editor queries without echoing record ids
- 第 49 行：`test` — standalone administration pages retain a dashboard return link
- 第 55 行：`test` — return paths reject public, external and encoded routing structure
- 第 56 行：`test` — route resolution rejects encoded structural ambiguity

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
