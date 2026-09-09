# tests/release/native-services.spec.mjs

## 文件定位

- **源码路径**：`tests/release/native-services.spec.mjs`
- **功能定位**：真实SQLite及PBKDF2集成回归；以六位数字和六位字母验证改密、注册及重新登录，并继续检查会话撤销。
- **规模**：106 行，7386 字节
- **内容校验**：SHA-256 `c5e87ca55139a3a6d67c5fd415a5842f7d26c864241242cc07bedc5449639647`

## 使用与维护

真实SQLite及PBKDF2集成回归；以六位数字和六位字母验证改密、注册及重新登录，并继续检查会话撤销。

## 直接依赖

- `node:test`
- `node:assert/strict`
- `node:sqlite`
- `node:module`
- `node:crypto`
- `node:path`
- `../../scripts/db/migrations.mjs`

本轮实现与验证详见 `docs/45_顶部账号按钮与六位密码.md`。
