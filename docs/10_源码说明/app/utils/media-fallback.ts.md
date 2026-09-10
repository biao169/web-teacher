# app / utils / media-fallback.ts

## 文件定位

- **源码路径**：`app/utils/media-fallback.ts`
- **文件类型**：程序/脚本
- **功能定位**：头像姓氏、新闻首分类和编辑字段的媒体缺失文字规则，兼容中文复姓与英文姓氏。
- **规模**：51 行，2129 字节
- **内容校验**：SHA-256 `68ccf23bd13db241aaec44d8d5da987e2f4832915896f01e36079f8c8e66bedf`

## 直接依赖

无显式 import；可能由 Nuxt 自动导入、框架默认入口或声明式配置接入。

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `text` | 函数，第 6 行 | 文件内部的 `text` 实现；按下方完整调用签名传入参数，参与本文件“头像姓氏、新闻首分类和编辑字段的媒体缺失文字规则，兼容中文复姓与英文姓氏。”所述流程。 |
| `clipped` | 函数，第 10 行 | 文件内部的 `clipped` 实现；按下方完整调用签名传入参数，参与本文件“头像姓氏、新闻首分类和编辑字段的媒体缺失文字规则，兼容中文复姓与英文姓氏。”所述流程。 |
| `mediaSurnameFallback` | 函数，第 15 行 | 从中文姓名识别复姓或单姓，从英文姓名提取姓氏，作为头像缺失文字。 |
| `mediaCategoryFallback` | 函数，第 27 行 | 提取第一个分号分类并限制显示长度，作为新闻或媒体缺失文字。 |
| `adminMediaFieldFallback` | 函数，第 34 行 | 根据模块、字段和对象记录选择头像姓氏、新闻分类或通用媒体文字。 |

### 调用签名

- `text`：`function text(value: unknown): string`
- `clipped`：`function clipped(value: string, maximum: number): string`
- `mediaSurnameFallback`：`export function mediaSurnameFallback(value: unknown): string`
- `mediaCategoryFallback`：`export function mediaCategoryFallback(value: unknown): string`
- `adminMediaFieldFallback`：`export function adminMediaFieldFallback( module: string, field: string, record: Readonly<Record<string, unknown>>, ): string`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
