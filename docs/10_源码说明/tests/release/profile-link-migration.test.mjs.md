# tests/release/profile-link-migration.test.mjs

## 文件定位

- **源码路径**：`tests/release/profile-link-migration.test.mjs`
- **功能定位**：0010真实SQLite升级回归，验证旧资料不变、空值与0、整数边界、无效值拒绝和重复启动幂等。
- **规模**：30 行，2049 字节
- **内容校验**：SHA-256 `682167c55d8f6323a9b30293063aa34f8f4d78d5a10abde36699883b2a3592f7`

## 使用与维护

0010真实SQLite升级回归，验证旧资料不变、空值与0、整数边界、无效值拒绝和重复启动幂等。

## 直接依赖

- `node:assert/strict`
- `node:test`
- `node:path`
- `better-sqlite3`
- `../../scripts/db/migrations.mjs`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
