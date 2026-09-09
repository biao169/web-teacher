# app/composables/usePublicSelection.ts

## 文件定位

- **源码路径**：`app/composables/usePublicSelection.ts`
- **功能定位**：继续管理按模块和UID隔离的200条选择与既有分批准备能力；新增稳定contextKey供一键复制监听模块、语言、版本、路径、当前论文格式与UID选择变化。
- **规模**：109 行，7159 字节
- **内容校验**：SHA-256 `54ea19992603b4ec711b494fbbc38138698828a6a55b61dab536452b8114e7e6`

## 使用与维护

继续管理按模块和UID隔离的200条选择与既有分批准备能力；新增稳定contextKey供一键复制监听模块、语言、版本、路径、当前论文格式与UID选择变化。

命名函数：`usePublicSelection`、`invalidate`、`setEntries`、`toggle`、`togglePage`、`clear`、`removeUnavailable`、`prepare`。

## 直接依赖

- `./usePublicCitationStyle`
- `~~/shared/utils/public-selection`
- `vue`
- `~~/shared/contracts/public-selection`
- `~~/shared/contracts/public-site`

本步说明见 `docs/39_前台改版_一键复制.md`。一键复制已在第7步实施；真实浏览器与系统剪贴板验收属于第8步。
