# server/services/public/public-page.ts

## 文件定位

- **源码路径**：`server/services/public/public-page.ts`
- **功能定位**：公开页分页、面包屑、筛选与查询模型；返回固定导航范围并从可见筛选组移除锁定字段。
- **规模**：112 行，4655 字节
- **内容校验**：SHA-256 `bad1f943b68b43db720173d9be3dcef2919c0b1eadc4b434710e0ea5faf3a5c1`

## 使用与维护

公开页分页、面包屑、筛选与查询模型；返回固定导航范围并从可见筛选组移除锁定字段。

命名函数：`pagination`、`queryView`、`pageMeta`、`parseFacetRows`、`filterGroups`、`facetRow`。

## 直接依赖

- `../../../shared/contracts/public-content`
- `../../../shared/contracts/public-site`
- `../../../shared/contracts/i18n`
- `../../../db/contracts`
- `./public-row`
- `./errors`
- `./public-query`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
