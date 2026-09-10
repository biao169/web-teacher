# app/composables/usePublicCitationPage.ts

## 文件定位

- **源码路径**：`app/composables/usePublicCitationPage.ts`
- **功能定位**：服务端首屏和客户端格式切换共用批量引文读取；以语言/路由/版本/格式/UID组成数据键，复用SSR水合数据并在后续读取时核对最新内容。
- **规模**：20 行，1497 字节
- **内容校验**：SHA-256 `955e5b791684e2ff0a355dad86dd59851864ffec279871c866e489b239358210`

## 使用与维护

服务端首屏和客户端格式切换共用批量引文读取；以语言/路由/版本/格式/UID组成数据键，复用SSR水合数据并在后续读取时核对最新内容。

命名函数：`usePublicCitationPage`。

## SSR与并发

useAsyncData按语言、页面路径、数据修订、引用格式和页面UID集合隔离结果，接收Nuxt AbortSignal并使用cancel去重；readPublicCitationPage每批请求超时15秒。SSR等待批次完成后输出全文，首次水合复用payload，后续操作不使用持久页面缓存。格式/版本不匹配的旧数据不会呈现为当前格式。失败由列表保留UID行与重读入口，避免把旧格式当成新格式。

## 直接依赖

- `vue`
- `~~/shared/contracts/public-content`
- `~~/shared/contracts/public-citation`
- `~~/shared/contracts/public-selection`
- `~~/shared/utils/public-citation`
- `./usePublicCitationStyle`

本步说明见 `docs/26_前台论文引文展示验收.md`；第7步已按最新范围完成统一复制与滚动加载，Word专项适配已取消；第8步首页与详情整合待执行。
