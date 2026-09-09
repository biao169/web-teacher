# server/services/public/modules/publications.ts

## 文件定位

- **源码路径**：`server/services/public/modules/publications.ts`
- **功能定位**：公开论文服务：普通列表仍轻量；有界选择投影装配当前格式与公开PDF；详情的四种格式复用同一个publicCitation函数。
- **规模**：126 行，9967 字节
- **内容校验**：SHA-256 `880567b5bfc938daaaf17f36cd0745a20c1e06dcc7884fa37baaa616704b7819`

## 使用与维护

公开论文服务：普通列表仍轻量；有界选择投影装配当前格式与公开PDF；详情的四种格式复用同一个publicCitation函数。

命名函数：`citations`。

## 直接依赖

- `../../../../db/contracts`
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
- `../public-citation`
- `../../../../shared/contracts/public-citation`

本步说明见 `docs/26_前台论文引文展示验收.md`；第7步已按最新范围完成统一复制与滚动加载，Word专项适配已取消；第8步首页与详情整合待执行。
