# server/services/public/modules/research.ts

## 文件定位

- **源码路径**：`server/services/public/modules/research.ts`
- **功能定位**：普通研究列表仅提供两行适用摘要；详情和按UID复制保留完整说明，复用本地化和权限。
- **规模**：67 行，4901 字节
- **内容校验**：SHA-256 `1c41039e92df6785c4d1b61a6b32d63dbfea2e9b42b7f40e7d1f164751049520`

## 使用与维护

普通研究列表仅提供两行适用摘要；详情和按UID复制保留完整说明，复用本地化和权限。

## 直接依赖

- `../../../../shared/utils/public-path`
- `../errors`
- `../../../../db/contracts`
- `../../../../shared/contracts/public-content`
- `../../../../shared/contracts/i18n`
- `../../../cache/public-cache`
- `../../i18n/translation-reader`
- `../../media/media-service`
- `../public-content-store`
- `../public-localization`
- `../public-module-base`
- `../public-page`
- `../public-query`
- `../public-values`

本步说明见 `docs/29_前台双语性能与兼容验收.md`；第9步已完成双语、性能及能力回退自动化验证；第10步综合验收与交付。Word专项已取消。
