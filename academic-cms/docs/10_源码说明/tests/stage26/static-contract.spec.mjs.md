# tests / stage26 / static-contract.spec.mjs

## 文件定位

- **源码路径**：`tests/stage26/static-contract.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：193 行，9620 字节
- **内容校验**：SHA-256 `128afabbfbd94ad1cc4fae884ee1bb927ba994c8c272f4581f570ab517de9639`

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `text` | 函数变量，第 7 行 | 封装 text 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 29 次。 |
| `walk` | 函数，第 9 行 | 封装 walk 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |

### 调用签名

- `text`：`text = relative => readFile(resolve(root, relative), 'utf8')`
- `walk`：`async function walk(directory)`

## 测试场景

- 第 20 行：`test` — stage A dependencies are pinned and configured without Nuxt-wide runtime modules
- 第 32 行：`test` — admin runtime is client-only, gated by an exact admin boundary and dynamically loads heavy state libraries
- 第 42 行：`test` — public routes and public UI do not statically import admin UI/state dependencies
- 第 56 行：`test` — Element Plus styles are loaded on demand rather than duplicated by a full CSS bundle
- 第 63 行：`test` — admin middleware rejects anonymous, forced-password, unknown and forbidden routes before page data
- 第 76 行：`test` — admin read and write handlers preserve different request-protection boundaries
- 第 88 行：`test` — dashboard route uses the read handler and a permission-aware bounded store
- 第 99 行：`test` — layout contains one scrolling workspace, responsive navigation and no full-page public dependencies
- 第 109 行：`test` — account actions preserve a safe current admin return path and use full-document transitions
- 第 120 行：`test` — admin UI persistence handles unavailable localStorage and has one store source
- 第 129 行：`test` — special status pages and module placeholder exist without v-html
- 第 140 行：`test` — migration adds the dashboard log index and manifest records it
- 第 150 行：`test` — public entry points force a fresh document when entering the admin runtime
- 第 158 行：`test` — admin UI preferences hydrate before the first client paint
- 第 164 行：`test` — internal security protocol/configuration failures remain observable in server logs
- 第 171 行：`test` — dashboard module cards omit the dashboard self-link
- 第 176 行：`test` — browser acceptance covers anonymous and authenticated administration shell flows
- 第 186 行：`test` — release gate executes the isolated production browser workflow after the Ubuntu build

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
