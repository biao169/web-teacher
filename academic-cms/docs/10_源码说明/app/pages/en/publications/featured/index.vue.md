# app/pages/en/publications/featured/index.vue

## 文件定位

- **源码路径**：`app/pages/en/publications/featured/index.vue`
- **功能定位**：双语论文或精选论文页：先读取轻量列表，再await当前格式有界批次完成SSR；共用SEO、重读与reactive数据。
- **规模**：10 行，784 字节
- **内容校验**：SHA-256 `2b3928ee12cffcb79c8267ea69da48b6b2e27d35b981d2b3feae7a715082779d`

## 使用与维护

双语论文或精选论文页：先读取轻量列表，再await当前格式有界批次完成SSR；共用SEO、重读与reactive数据。

命名函数：`retryCitations`。

## 直接依赖

- `~~/shared/contracts/public-content`

本步说明见 `docs/26_前台论文引文展示验收.md`；第7步已按最新范围完成统一复制与滚动加载，Word专项适配已取消；第8步首页与详情整合待执行。
