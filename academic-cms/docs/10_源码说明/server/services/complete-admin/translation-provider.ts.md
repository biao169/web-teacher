# server/services/complete-admin/translation-provider.ts

## 文件定位

- **源码路径**：`server/services/complete-admin/translation-provider.ts`
- **功能定位**：翻译服务客户端与响应解析；统一使用项目根目录别名导入共享 core.mjs，避免混用多级相对路径。
- **规模**：132 行，8804 字节
- **内容校验**：SHA-256 `80e7ee88a6b7abf16479e8df528b21c7611d8c4f32d530bd1bb5753a25909ac7`

## 使用与维护

翻译服务客户端与响应解析；统一使用项目根目录别名导入共享 core.mjs，避免混用多级相对路径。

命名函数：`providerFailure`、`object`、`providerConfig`、`responseError`、`parseProviderResponse`、`createTranslationClient`、`fetchTexts`、`myMemory`、`translate`。

## 直接依赖

- `~~/shared/complete-admin/core.mjs`
- `../../../shared/admin/translation`
- `../../i18n/fingerprint`

本轮说明见 `docs/32_Windows启动缓存与共享引用修复.md`。
