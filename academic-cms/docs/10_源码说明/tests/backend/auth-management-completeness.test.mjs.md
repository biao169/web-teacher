# tests/backend/auth-management-completeness.test.mjs

## 文件定位

- **源码路径**：`tests/backend/auth-management-completeness.test.mjs`
- **功能定位**：后台账号完整性与0009升级回归；按迁移名称定位0009，避免新增后续迁移改变测试前置状态。
- **规模**：73 行，5099 字节
- **内容校验**：SHA-256 `512feb04219e0cbcbc38864b98491ef2359a1e8c177da83128538a46df07ac16`

## 使用与维护

后台账号完整性与0009升级回归；按迁移名称定位0009，避免新增后续迁移改变测试前置状态。

## 直接依赖

- `node:assert/strict`
- `node:fs`
- `node:path`
- `node:test`
- `better-sqlite3`
- `../../scripts/db/migrations.mjs`
- `../../shared/complete-admin/core.mjs`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
