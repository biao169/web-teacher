# server/services/complete-admin/metadata-service.ts

## 文件定位

- **源码路径**：`server/services/complete-admin/metadata-service.ts`
- **功能定位**：论文元数据服务与主页教师姓名提取；主页教师辅助使用前台相同的精选条件和稳定排序，保留原权限入口。
- **规模**：491 行，25610 字节
- **内容校验**：SHA-256 `714d02fc7dd663c5fce49463b6493b88f9cd7dde97f7b9f17040ce1a3971f958`

## 使用与维护

论文元数据服务与主页教师姓名提取；主页教师辅助使用前台相同的精选条件和稳定排序，保留原权限入口。

命名函数：`record`、`records`、`text`、`firstText`、`textList`、`yearValue`、`containsControlCharacter`、`cleanAbstract`、`publicationType`、`validProvider`、`configuredProviders`、`normalizeLookup`、`fetchJson`、`crossrefResult`、`openAlexAbstract`、`openAlexResult`、`dataCiteResult`、`europePmcResult`、`pubmedSummaryResult`、`semanticScholarResult`、`providerLookup`、`attemptFailure`、`normalizePatent`。

## 直接依赖

- `../../../db/public-content-rules`
- `h3`
- `../../../shared/admin/publication-tools`
- `../../utils/complete-admin/db`

本步说明见 `docs/35_前台改版_首页教师与快捷入口.md`。筛选简化、卡片、研究标签和一键复制继续按第4–7步实施；真实浏览器视觉验收属于第8步。
