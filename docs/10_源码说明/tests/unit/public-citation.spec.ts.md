# tests/unit/public-citation.spec.ts

## 文件定位

- **源码路径**：`tests/unit/public-citation.spec.ts`
- **功能定位**：完整引文、四格式共享状态、安全高亮与有界读取回归；详情复制完整行为移至public-copy.spec.ts。
- **规模**：100 行，9622 字节
- **内容校验**：SHA-256 `f2e233ab737031d1ab0b2d97de96afe2b39f9f72c0d64176e8d1203fca02067b`

## 使用与维护

完整引文、四格式共享状态、安全高亮与有界读取回归；详情复制完整行为移至public-copy.spec.ts。

命名函数：`mount`、`choose`。

## 直接依赖

- `vitest`
- `vue`
- `../../app/components/public/content/CitationText.vue`
- `../../app/components/public/content/CitationStyleControl.vue`
- `../../app/components/public/content/PublicationsList.vue`
- `../../app/components/public/content/PublicationDetail.vue`
- `../../app/composables/usePublicSelection`
- `../../shared/utils/public-citation`
- `../../shared/contracts/public-citation`

本步说明见 `docs/27_前台统一复制与滚动加载验收.md`；第7步已按最新要求完成共用复制与滚动加载，Word专项适配已取消；第8步继续首页与详情整合。
