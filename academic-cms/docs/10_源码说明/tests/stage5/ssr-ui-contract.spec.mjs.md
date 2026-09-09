# tests/stage5/ssr-ui-contract.spec.mjs

## 文件定位

- **源码路径**：`tests/stage5/ssr-ui-contract.spec.mjs`
- **功能定位**：公开渲染隔离与API边界检查，新增PDF媒体路由按媒体错误边界验证，其余JSON接口保持原边界。
- **规模**：76 行，4207 字节
- **内容校验**：SHA-256 `f5b301462ef17de25f031bb9784650e8611b11860ae29387dc4ae249f6a0613e`

## 使用与维护

公开渲染隔离与API边界检查，新增PDF媒体路由按媒体错误边界验证，其余JSON接口保持原边界。

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`
- `../helpers/offline-stage5.mjs`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
