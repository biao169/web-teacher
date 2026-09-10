# server/services/public/public-localization.ts

## 文件定位

- **源码路径**：`server/services/public/public-localization.ts`
- **功能定位**：维护翻译字段槽位并解析本地化文本；支持顺序分批解析且逐批校验结果数量，避免教师整页长简介突破翻译读取器既有8MiB总量限制。
- **规模**：45 行，2014 字节
- **内容校验**：SHA-256 `4a6e147db7aa1e144801176cffb0cd32730f7153623af6f9354f7df00e3f5270`

## 使用与维护

维护翻译字段槽位并解析本地化文本；支持顺序分批解析且逐批校验结果数量，避免教师整页长简介突破翻译读取器既有8MiB总量限制。

## 直接依赖

- `../../../shared/contracts/i18n`
- `../../i18n/source-ref`
- `../i18n/translation-reader`
- `./errors`

本步说明见 `docs/40_前台改版_综合验收与交付.md`。本轮执行工程验收；真实浏览器访问受环境安全策略阻止，系统剪贴板与实机视觉仍未覆盖，静态规范检查遗留问题单列。
