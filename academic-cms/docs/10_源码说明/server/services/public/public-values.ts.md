# server/services/public/public-values.ts

## 文件定位

- **源码路径**：`server/services/public/public-values.ts`
- **功能定位**：公开文本、日期、媒体与链接的安全投影工具；摘要函数支持显式输入字节预算，教师长简介先验证再生成短摘要，默认字段限制仍为64,000字节。
- **规模**：142 行，6183 字节
- **内容校验**：SHA-256 `686535c4ada10d10e2bf15740ae9e346fdaab9d99be51f9de2d7d4940153a1da`

## 使用与维护

公开文本、日期、媒体与链接的安全投影工具；摘要函数支持显式输入字节预算，教师长简介先验证再生成短摘要，默认字段限制仍为64,000字节。

命名函数：`publicNow`、`normalizedConfiguredText`、`plainText`、`excerpt`、`boundedList`、`safeExternalUrl`、`safeMailAddress`、`safeDoi`、`publicMedia`、`missingPublicMedia`、`localizedPublicMedia`、`localizedDate`、`periodLabel`、`safeRecordIdentifier`。

## 直接依赖

- `../../../shared/contracts/i18n`
- `../../../shared/contracts/media`
- `../../../shared/contracts/public-site`
- `../../../shared/utils/unicode`
- `./errors`

本步说明见 `docs/40_前台改版_综合验收与交付.md`。本轮执行工程验收；真实浏览器访问受环境安全策略阻止，系统剪贴板与实机视觉仍未覆盖，静态规范检查遗留问题单列。
