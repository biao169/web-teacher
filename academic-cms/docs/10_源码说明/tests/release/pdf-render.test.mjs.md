# tests/release/pdf-render.test.mjs

## 文件定位

- **源码路径**：`tests/release/pdf-render.test.mjs`
- **功能定位**：使用真实PDF.js兼容构建和原生画布渲染两页PDF，验证页面尺寸、非空像素和文字提取；属于Node渲染验证，不等同实机浏览器。
- **规模**：27 行，1694 字节
- **内容校验**：SHA-256 `c3b598256772e7f3fbbea04813a99b0c7f5b1414b7183eab2fbc0533f1e08e30`

## 使用与维护

使用真实PDF.js兼容构建和原生画布渲染两页PDF，验证页面尺寸、非空像素和文字提取；属于Node渲染验证，不等同实机浏览器。

## 直接依赖

- `node:test`
- `node:assert/strict`
- `node:module`
- `node:path`
- `../helpers/pdf-fixture.mjs`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
