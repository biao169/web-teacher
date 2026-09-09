# app/components/public/content/PublicationsList.vue

## 文件定位

- **源码路径**：`app/components/public/content/PublicationsList.vue`
- **功能定位**：普通与精选论文共用滚动列表：逐页传给PublicationRows，共享四格式控件、选择状态和复制入口。
- **规模**：16 行，1066 字节
- **内容校验**：SHA-256 `726ae5d3eb95705fb47225774e1f8d35be0387e0e8d19a93fecd0f3afa0c1d5b`

## 使用与维护

普通与精选论文共用滚动列表：逐页传给PublicationRows，共享四格式控件、选择状态和复制入口。

## 直接依赖

- `~~/shared/contracts/public-content`
- `~~/shared/contracts/public-citation`
- `./CitationStyleControl.vue`
- `./PublicationRows.vue`

本步说明见 `docs/27_前台统一复制与滚动加载验收.md`；第7步已按最新要求完成共用复制与滚动加载，Word专项适配已取消；第8步继续首页与详情整合。
