# tests/helpers/offline-stage4.mjs

## 文件定位

- **源码路径**：`tests/helpers/offline-stage4.mjs`
- **功能定位**：首页离线测试装配，启用模型缓存以覆盖真实运行层。
- **规模**：218 行，12750 字节
- **内容校验**：SHA-256 `b97c528fb141aa8295d979d759962128d73604fc549e69e4cde92b5854994526`

## 使用与维护

首页离线测试装配，启用模型缓存以覆盖真实运行层。

命名函数：`syncConnection`、`createHarness`、`recordingAdapter`、`insert`、`iso`、`seedPublicHome`、`createHomeService`。

## 直接依赖

- `node:sqlite`
- `node:module`
- `node:path`
- `node:url`
- `../../scripts/db/migrations.mjs`

本步说明见 `docs/30_前台缓存与综合交付验收.md`；第10步已完成前台缓存与综合自动化验收、源码交付；实机验收边界见最终报告。Word专项已取消。
