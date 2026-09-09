# tests/helpers/offline-stage3.mjs

## 文件定位

- **源码路径**：`tests/helpers/offline-stage3.mjs`
- **功能定位**：数据库/缓存离线测试装配，导出新模型缓存实现。
- **规模**：72 行，3883 字节
- **内容校验**：SHA-256 `fbd8b4c9e0cf7076a2f077300d187b0d0eac3766544736e34e2175095298df02`

## 使用与维护

数据库/缓存离线测试装配，导出新模型缓存实现。

命名函数：`syncConnection`、`createHarness`、`insert`、`iso`。

## 直接依赖

- `node:sqlite`
- `node:module`
- `node:path`
- `node:url`
- `../../scripts/db/migrations.mjs`

本步说明见 `docs/30_前台缓存与综合交付验收.md`；第10步已完成前台缓存与综合自动化验收、源码交付；实机验收边界见最终报告。Word专项已取消。
