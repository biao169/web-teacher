# server/services/public/modules/students.ts

## 文件定位

- **源码路径**：`server/services/public/modules/students.ts`
- **功能定位**：学生双语模型及后台分类映射；额外返回按显示顺序本地化的分类信息供默认分区。
- **规模**：141 行，11111 字节
- **内容校验**：SHA-256 `d13efb728840821865fc833c0994cd96af4b44873e7157c8603e8079ea07a876`

## 使用与维护

学生双语模型及后台分类映射；额外返回按显示顺序本地化的分类信息供默认分区。

命名函数：`categoryPlan`、`localizedCategories`、`categoryFor`。

## 直接依赖

- `../../../../db/contracts`
- `../../../../shared/utils/public-categories`
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

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
