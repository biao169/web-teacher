# tests/release/windows-dev-preparation.test.mjs

## 文件定位

- **源码路径**：`tests/release/windows-dev-preparation.test.mjs`
- **功能定位**：验证开发缓存清理的可重复性、用户数据与生产输出保留，以及源码不完整时在删除前终止。
- **规模**：45 行，2142 字节
- **内容校验**：SHA-256 `b94e777f4d322b0ad4acdb006347cef4923bb5ab2bcc5b5299c953b9e87c6495`

## 使用与维护

验证开发缓存清理的可重复性、用户数据与生产输出保留，以及源码不完整时在删除前终止。


## 直接依赖

- `node:assert/strict`
- `node:test`
- `node:fs/promises`
- `node:os`
- `node:path`
- `../../scripts/windows/prepare-development.mjs`

本轮说明见 `docs/32_Windows启动缓存与共享引用修复.md`。
