# scripts / build-target.mjs

## 文件定位

- **源码路径**：`scripts/build-target.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：53 行，2567 字节
- **内容校验**：SHA-256 `10fd3d14154ef0225020b958bdbc2d2687534daaf800d008a3d16d904ea031fe`

## 直接依赖

- `./lib/build-output.mjs`
- `./lib/cloudflare-assets.mjs`
- `./lib/database-bundle.mjs`
- `./lib/run-command.mjs`
- `./release/build-transaction.mjs`
- `./release/environment.mjs`
- `./release/inputs.mjs`
- `./release/process.mjs`
- `node:fs/promises`
- `node:path`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
