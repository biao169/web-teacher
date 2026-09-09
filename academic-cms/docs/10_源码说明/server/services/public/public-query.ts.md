# server/services/public/public-query.ts

## 文件定位

- **源码路径**：`server/services/public/public-query.ts`
- **功能定位**：公开列表查询规范、分页限制与安全编码；内部请求包含固定导航范围，列表路径保留来源nav。
- **规模**：119 行，6108 字节
- **内容校验**：SHA-256 `a189e447a7fd99dd3b893605bd28908523470296fbe4c8472109a35ad2b611c1`

## 使用与维护

公开列表查询规范、分页限制与安全编码；内部请求包含固定导航范围，列表路径保留来源nav。

命名函数：`single`、`positiveInteger`、`bounded`、`parsePublicLocale`、`parsePublicListRequest`、`canonicalListResource`、`publicListPath`、`sqlSearchPattern`、`parsePublicLocaleQuery`。

## 直接依赖

- `../../../shared/contracts/public-citation`
- `../../../shared/contracts/public-content`
- `../../../shared/contracts/i18n`
- `../../../shared/utils/unicode`
- `../../../shared/utils/public-list-link`
- `./errors`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
