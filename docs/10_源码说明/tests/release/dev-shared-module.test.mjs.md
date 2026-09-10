# tests/release/dev-shared-module.test.mjs

## 文件定位

- **源码路径**：`tests/release/dev-shared-module.test.mjs`
- **功能定位**：使用项目锁定的 Nuxt 配置与 Nitro 开发打包器，验证共享 core.mjs 和翻译服务没有外部源码引用，且构建模块可在含中文、空格的临时目录执行。
- **规模**：65 行，3394 字节
- **内容校验**：SHA-256 `b89188ebeb07e4bd618fb7801c7f45131e1bc771b173c56f2d32f54a062a997f`

## 使用与维护

使用项目锁定的 Nuxt 配置与 Nitro 开发打包器，验证共享 core.mjs 和翻译服务没有外部源码引用，且构建模块可在含中文、空格的临时目录执行。

测试通过 Nitro 暴露的 Rollup 配置进行一次性开发编译，无监听端口；加载模块后检查资源目录、翻译响应解析与请求构造，结束时关闭编译器并清理自建临时目录。

## 直接依赖

- `node:assert/strict`
- `node:test`
- `node:module`
- `node:fs/promises`
- `node:os`
- `node:path`
- `node:url`
- `nuxt/kit`
- `~~/shared/complete-admin/core.mjs`

本次修复、应用步骤及验收边界见 `docs/31_Windows开发模块路径修复.md`。
