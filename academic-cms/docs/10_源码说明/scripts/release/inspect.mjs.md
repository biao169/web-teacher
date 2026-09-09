# scripts / release / inspect.mjs

## 文件定位

- **源码路径**：`scripts/release/inspect.mjs`
- **文件类型**：脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：13 行，746 字节
- **内容校验**：SHA-256 `e7d915674b0a7230b5f54d2aa6030af208c82f4a0951484675b5837514f0e87b`

## 直接依赖

- `../lib/run-command.mjs`
- `./environment.mjs`
- `./inputs.mjs`
- `node:fs/promises`
- `node:path`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
