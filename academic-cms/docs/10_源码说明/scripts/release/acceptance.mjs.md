# scripts / release / acceptance.mjs

## 文件定位

- **源码路径**：`scripts/release/acceptance.mjs`
- **文件类型**：脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：53 行，2849 字节
- **内容校验**：SHA-256 `0905a0e4e82c5eecf5a1fe7ee67e2326c887e88adf1e1fce906f8fcbd7c646ba`

## 直接依赖

- `../lib/run-command.mjs`
- `./continuity.mjs`
- `./environment.mjs`
- `./inputs.mjs`
- `./process.mjs`
- `node:crypto`
- `node:fs/promises`
- `node:path`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
