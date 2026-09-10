# app/utils/pdf-document.ts

## 文件定位

- **源码路径**：`app/utils/pdf-document.ts`
- **功能定位**：仅在PDF进入视口后动态加载PDF.js兼容构建和本地Worker；关闭提前抓取与流式整篇下载，通过Range读取所需字节，字体和CMap来自本地静态资源。
- **规模**：18 行，959 字节
- **内容校验**：SHA-256 `507b950237692a942cf76f67df3f938fcaec4b3ec4383f6cf581283e5ae0cebc`

## 使用与维护

仅在PDF进入视口后动态加载PDF.js兼容构建和本地Worker；关闭提前抓取与流式整篇下载，通过Range读取所需字节，字体和CMap来自本地静态资源。

## 直接依赖

- `pdfjs-dist`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
