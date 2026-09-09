# tests / unit / request-id.spec.ts

## 文件定位

- **源码路径**：`tests/unit/request-id.spec.ts`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：44 行，1442 字节
- **内容校验**：SHA-256 `80be2b7ae5da661c0cd43acfc556f93f4e17353732c30eeeeec13d8eb8f7b65b`

## 直接依赖

- `../../shared/utils/request-id`
- `vitest`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `generate` | 对象函数，第 41 行 | 封装 generate 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |

### 调用签名

- `generate`：`generate: () => 'bad'`

## 测试场景

- 第 4 行：`describe` — normalizeRequestId
- 第 5 行：`it` — accepts and trims a bounded safe request ID
- 第 22 行：`describe` — selectRequestId
- 第 23 行：`it` — prioritizes Cloudflare Ray ID over a forwarded value
- 第 30 行：`it` — uses a safe forwarded request ID outside Cloudflare
- 第 34 行：`it` — generates an ID when upstream values are absent or unsafe
- 第 40 行：`it` — fails closed when a custom generator returns an unsafe value

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
