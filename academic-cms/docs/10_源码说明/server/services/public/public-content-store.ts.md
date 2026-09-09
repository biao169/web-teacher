# server/services/public/public-content-store.ts

## 文件定位

- **源码路径**：`server/services/public/public-content-store.ts`
- **功能定位**：公开列表、详情、筛选候选的数据库读取；导航基准搜索与访客搜索AND相交，候选不能移除锁定条件；教师平台和项目金额统一读取。
- **规模**：606 行，41478 字节
- **内容校验**：SHA-256 `2e0c17c54194113a17d348ebaee0265af7e15359fbe2732434dddd096424aa2c`

## 使用与维护

公开列表、详情、筛选候选的数据库读取；导航基准搜索与访客搜索AND相交，候选不能移除锁定条件；教师平台和项目金额统一读取。

命名函数：`whereFor`、`trimSql`、`memberTable`、`facetArm`、`facetCommand`、`hasListFilters`、`listCommands`、`listSnapshot`、`listBatch`、`profileSummary`、`profileDetail`、`publicationSummary`、`publicationDetail`、`projectSummary`、`projectDetail`、`patentSummary`、`patentDetail`、`studentSummary`、`studentDetail`、`studentCategory`、`research`、`newsSummary`、`newsDetail`、`courseSummary`、`courseDetail`、`isPublicSitemapModule`、`timedConfig`。

## 直接依赖

- `./public-profile-links`
- `../../../shared/contracts/public-content`
- `../../../db/public-content-rules`
- `../../../shared/contracts/public-citation`
- `./public-citation`
- `../../../db/contracts`
- `../../../shared/enums/auth`
- `../../../db/query`
- `../../view-model/serializer`
- `../../../shared/contracts/public-selection`
- `../../../shared/contracts/public-site`
- `./public-query`
- `./public-store-helpers`
- `./public-page`
- `./errors`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
