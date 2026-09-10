# shared/contracts/public-citation.ts

## 文件定位

- **源码路径**：`shared/contracts/public-citation.ts`
- **功能定位**：共用引用契约、服务或前台分段/批次辅助；具体方法与预算见下文。
- **规模**：19 行，884 字节
- **内容校验**：SHA-256 `8e76f80986fa1eceb39c16157c8cdd8636d9da363bccaa05d404af8ca0b37ba9`

## 使用与维护

共用引用契约、服务或前台分段/批次辅助；具体方法与预算见下文。

命名函数：`isPublicCitationStyle`。

## 状态契约

PUBLIC_CITATION_STYLES固定gbt/elsevier/apa/ieee。PublicCitation含style、label、status、text、highlights；status为saved/generated/missing。缺失格式text为空，不用另一格式冒充。PublicCitationPage按UID携带当前格式及允许公开的PDF。

## 直接依赖

- `./public-site`

本步说明见 `docs/26_前台论文引文展示验收.md`；第7步已按最新范围完成统一复制与滚动加载，Word专项适配已取消；第8步首页与详情整合待执行。
