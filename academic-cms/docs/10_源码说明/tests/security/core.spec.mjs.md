# tests/security/core.spec.mjs

## 文件定位

- **源码路径**：`tests/security/core.spec.mjs`
- **功能定位**：安全核心回归；核对新密码六个Unicode字符下限、常见与账号相似密码接受、过短和非法输入拒绝及NFC规范化。
- **规模**：186 行，12477 字节
- **内容校验**：SHA-256 `87b98ac1bc555ef39962c5f5558b61e9b287e305249f436121e52d2f1a6a58ea`

## 使用与维护

安全核心回归；核对新密码六个Unicode字符下限、常见与账号相似密码接受、过短和非法输入拒绝及NFC规范化。

## 直接依赖

- `node:test`
- `node:assert/strict`
- `../helpers/offline-security.mjs`

本轮实现与验证详见 `docs/45_顶部账号按钮与六位密码.md`。
