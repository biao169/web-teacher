# tests/security/primitives.spec.mjs

## 文件定位

- **源码路径**：`tests/security/primitives.spec.mjs`
- **功能定位**：安全原语回归；密码策略用例适配至少6位要求，密码散列、Cookie和令牌原有检查保留。
- **规模**：91 行，5886 字节
- **内容校验**：SHA-256 `e1ed60aaa52ab028e742099a62a2e4c68a0876994cf60e7705ebf368c1aa00a7`

## 使用与维护

安全原语回归；密码策略用例适配至少6位要求，密码散列、Cookie和令牌原有检查保留。

## 直接依赖

- `node:test`
- `node:assert/strict`
- `node:crypto`
- `../helpers/offline-security.mjs`

本轮实现与验证详见 `docs/45_顶部账号按钮与六位密码.md`。
