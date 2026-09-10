# app/components/public/content/PdfDocument.vue

## 文件定位

- **源码路径**：`app/components/public/content/PdfDocument.vue`
- **功能定位**：PDF接近视口后加载解析器和文档，首屏只安排第一页；页尾接近视口且上一页就绪时追加一页。文档自然增高，无原生阅读器、内滚动区或下载工具栏。
- **规模**：74 行，4248 字节
- **内容校验**：SHA-256 `c57a99994661d14502cd5f06203693863c0268f4409de07dc7283f84d5e13aa6`

## 使用与维护

PDF接近视口后加载解析器和文档，首屏只安排第一页；页尾接近视口且上一页就绪时追加一页。文档自然增高，无原生阅读器、内滚动区或下载工具栏。

## 直接依赖

- `~/utils/pdf-document`
- `./PdfPage.vue`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
