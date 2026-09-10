# server/services/public/modules/news.ts

## 文件定位

- **源码路径**：`server/services/public/modules/news.ts`
- **功能定位**：列表保持摘要元数据，详情富文本媒体分离投影图片与PDF，为公开PDF生成每次可重新校验的读取地址。
- **规模**：120 行，9562 字节
- **内容校验**：SHA-256 `a7ea7fa0559839fdc8a3b10a0950e5867599f595405f115c67f97d0d79a0488e`

## 使用与维护

列表保持摘要元数据，详情富文本媒体分离投影图片与PDF，为公开PDF生成每次可重新校验的读取地址。

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
- `../public-content-blocks`
- `../public-localization`
- `../public-module-base`
- `../public-page`
- `../public-query`
- `../public-values`
- `../errors`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
