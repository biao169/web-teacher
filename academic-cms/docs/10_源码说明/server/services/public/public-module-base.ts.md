# server/services/public/public-module-base.ts

## 文件定位

- **源码路径**：`server/services/public/public-module-base.ts`
- **功能定位**：新闻详情缓存版本提升为2，使旧正文投影不复用于PDF详情；其余模块缓存策略保留。
- **规模**：58 行，3017 字节
- **内容校验**：SHA-256 `53dde4dbaec0b638c8b62f7f7ed981ef824043bcab85aba95e48081c5653f0c3`

## 使用与维护

新闻详情缓存版本提升为2，使旧正文投影不复用于PDF详情；其余模块缓存策略保留。

## 直接依赖

- `../../../shared/contracts/public-content`
- `./public-query`
- `../../cache/public-cache`
- `../i18n/translation-reader`
- `../media/media-service`
- `../../../shared/enums/auth`
- `../../cache/invalidation-map`
- `./public-result`
- `../../../shared/contracts/public-selection`
- `./public-values`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
