# tests/unit/news-rich-text.spec.ts

## 文件定位

- **源码路径**：`tests/unit/news-rich-text.spec.ts`
- **功能定位**：真实编辑器与服务端渲染往返测试，新增PDF节点连续三次保存后仍保留引用、标题及前后正文。
- **规模**：90 行，5374 字节
- **内容校验**：SHA-256 `7f4a1cacccf001046157ac509499c4932eac8fcc97b4e3d3fcc897c5899159c5`

## 使用与维护

真实编辑器与服务端渲染往返测试，新增PDF节点连续三次保存后仍保留引用、标题及前后正文。

## 直接依赖

- `vitest`
- `@tiptap/vue-3`
- `../../app/components/admin/complete/news-rich-text-extensions`
- `../../app/admin/news-rich-text`
- `../../shared/complete-admin/core.mjs`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
