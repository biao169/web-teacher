# server/services/public/modules/courses.ts

## 文件定位

- **源码路径**：`server/services/public/modules/courses.ts`
- **功能定位**：公开课程列表/详情服务，沿用翻译和媒体权限；选择请求提供完整公开简介，普通列表仍使用摘要。
- **规模**：86 行，6432 字节
- **内容校验**：SHA-256 `de00cf7309fd1dd63cd6c637023f5c203d1fec7c95fdf8555162bc4353b10cb6`

## 使用与维护

公开课程列表/详情服务，沿用翻译和媒体权限；选择请求提供完整公开简介，普通列表仍使用摘要。

## 直接依赖

- `../../../../db/contracts`
- `../../../../shared/contracts/public-content`
- `../../../../shared/contracts/i18n`
- `../../../../shared/contracts/media`
- `../../../../shared/utils/public-path`
- `../../../cache/public-cache`
- `../../i18n/translation-reader`
- `../../media/media-service`
- `../public-content-store`
- `../public-localization`
- `../public-module-base`
- `../public-page`
- `../public-query`
- `../public-values`
- `../errors`

本步说明见 `docs/25_前台多选与批量数据验收.md`；后续正式论文引文、第7步剪贴板复制与首页整合尚未完成。
