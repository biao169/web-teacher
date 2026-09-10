# tests / security / migration.spec.mjs

## 文件定位

- **源码路径**：`tests/security/migration.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：70 行，4275 字节
- **内容校验**：SHA-256 `7de1940bf8ec3f6db860092f8d88ecfe7d982d18d11a11a9b07723f7d9058b5e`

## 直接依赖

- `../helpers/offline-security.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `seedUser` | 函数，第 9 行 | 创建 User，并完成初始化或持久化处理 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `seedUser`：`function seedUser(db)`

## 测试场景

- 第 16 行：`test` — authentication migration is append-only stage 2 and creates all technical tables
- 第 31 行：`test` — session schema stores only a 64-hex token fingerprint and enforces revocation pairing
- 第 46 行：`test` — session and throttle lookup indexes are explicit and queryable
- 第 60 行：`test` — bootstrap singleton and throttle timelines fail closed at database level

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
