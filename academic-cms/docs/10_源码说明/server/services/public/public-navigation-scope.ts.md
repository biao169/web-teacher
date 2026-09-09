# server/services/public/public-navigation-scope.ts

## 文件定位

- **源码路径**：`server/services/public/public-navigation-scope.ts`
- **功能定位**：按保存的导航UID解析公开且启用的基准查询；校验所属列表、固定条件与附加查询，不存在或失效入口报错，不退回全库。
- **规模**：35 行，2770 字节
- **内容校验**：SHA-256 `2727aa9d1a0ee29ccfa0bf2d21e1c737f39555822e82a254fd99901a7c5b9f53`

## 使用与维护

按保存的导航UID解析公开且启用的基准查询；校验所属列表、固定条件与附加查询，不存在或失效入口报错，不退回全库。

命名函数：`parsePublicNavigationRequest`。

## 直接依赖

- `../../../db/contracts`
- `../../../db/query`
- `../../../shared/utils/public-list-link`
- `../../../shared/utils/public-path`
- `./public-query`
- `./public-row`
- `./errors`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
