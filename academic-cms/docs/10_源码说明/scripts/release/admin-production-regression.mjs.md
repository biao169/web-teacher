# scripts/release/admin-production-regression.mjs

## 文件定位

- **源码路径**：`scripts/release/admin-production-regression.mjs`
- **功能定位**：生产隔离HTTP验收，新增双语留言入口、真实留言写入与后台读取、关闭新闻留言、160次并发分组切页及独立API限流验证。
- **规模**：812 行，64371 字节
- **内容校验**：SHA-256 `fb7e566b1744ba64fddfcd1a11512cf26ef11c4134131141a7cf3ecfff9f4cc9`

## 使用与维护

生产隔离HTTP验收，新增双语留言入口、真实留言写入与后台读取、关闭新闻留言、160次并发分组切页及独立API限流验证。

## 直接依赖

- `../../tests/helpers/pdf-fixture.mjs`
- `happy-dom`
- `node:child_process`
- `node:crypto`
- `node:fs/promises`
- `node:net`
- `node:http`
- `node:path`
- `../lib/run-command.mjs`
- `../lib/build-output.mjs`
- `../db/migrations.mjs`
- `./assert-current-source.mjs`
- `./process.mjs`

本轮实现与验证详见 `docs/43_前台留言与请求稳定性修复.md`。
