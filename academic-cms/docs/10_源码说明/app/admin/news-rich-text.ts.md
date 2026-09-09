# app / admin / news-rich-text.ts

## 文件定位

- **源码路径**：`app/admin/news-rich-text.ts`
- **文件类型**：程序/脚本
- **功能定位**：新闻正文的原始格式转换，以及基础编辑器和富文本工具之间安全的返回路径。
- **规模**：27 行，1153 字节
- **内容校验**：SHA-256 `795f36349d2a5161531565fb8197f7633894ec7747cdc1abe1d5608009b38780`

## 直接依赖

无显式 import；可能由 Nuxt 自动导入、框架默认入口或声明式配置接入。

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `newsEditorReturnPath` | 函数，第 2 行 | 文件内部的 `newsEditorReturnPath` 实现；按下方完整调用签名传入参数，参与本文件“新闻正文的原始格式转换，以及基础编辑器和富文本工具之间安全的返回路径。”所述流程。 |
| `newsListReturnPath` | 函数，第 11 行 | 文件内部的 `newsListReturnPath` 实现；按下方完整调用签名传入参数，参与本文件“新闻正文的原始格式转换，以及基础编辑器和富文本工具之间安全的返回路径。”所述流程。 |
| `newsEditorInitialContent` | 函数，第 18 行 | 文件内部的 `newsEditorInitialContent` 实现；按下方完整调用签名传入参数，参与本文件“新闻正文的原始格式转换，以及基础编辑器和富文本工具之间安全的返回路径。”所述流程。 |

### 调用签名

- `newsEditorReturnPath`：`export function newsEditorReturnPath(value: unknown): string`
- `newsListReturnPath`：`export function newsListReturnPath(value: unknown): string`
- `newsEditorInitialContent`：`export function newsEditorInitialContent(source: string, format: string)`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
