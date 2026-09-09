# server/services/public/public-home-service.ts

## 文件定位

- **源码路径**：`server/services/public/public-home-service.ts`
- **功能定位**：首页输出经净化的footerHtml，保留footerText兼容字段；首页缓存版本9，配置更新沿用现有失效标签。
- **规模**：411 行，19683 字节
- **内容校验**：SHA-256 `0b85c7887e43641b24f80e57cb68ea73d19a42b0011fe6d75cbd79fc9cca114d`

## 使用与维护

首页输出经净化的footerHtml，保留footerText兼容字段；首页缓存版本9，配置更新沿用现有失效标签。

## 直接依赖

- `./public-content-blocks`
- `../../../shared/utils/public-list-link`
- `./public-profile-links`
- `../../../db/contracts`
- `../../../shared/contracts/i18n`
- `../../../shared/contracts/public-site`
- `../../../shared/contracts/media`
- `../../../shared/contracts/view-model`
- `../../../shared/utils/public-path`
- `../../cache/contracts`
- `../../cache/public-cache`
- `../i18n/translation-reader`
- `../media/media-service`
- `../../view-model/serializer`
- `./errors`
- `./public-row`
- `./public-localization`
- `./public-values`
- `./public-home-store`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
