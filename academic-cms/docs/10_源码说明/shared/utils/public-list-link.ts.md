# shared/utils/public-list-link.ts

## 文件定位

- **源码路径**：`shared/utils/public-list-link.ts`
- **功能定位**：公开列表筛选目录和ASCII安全URL编码；保留nav控制，将已保存的基准q留给服务器并腾出访客二次搜索框。
- **规模**：128 行，7485 字节
- **内容校验**：SHA-256 `5687c3895ff6b2ba58a554eaf63eb8961b2075d9bbaf7955ab994267a86cbfa2`

## 使用与维护

公开列表筛选目录和ASCII安全URL编码；保留nav控制，将已保存的基准q留给服务器并腾出访客二次搜索框。

命名函数：`publicListDefinition`、`publicFilterKeys`、`pack`、`unpackPublicListQuery`、`encodePublicListQuery`、`publicListHref`、`scopedNavigationHref`、`normalizePublicListHref`、`publicListRedirect`。

## 直接依赖

- `./unicode`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
