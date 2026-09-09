# tests / unit / publication-tools.spec.ts

## 文件定位

- **源码路径**：`tests/unit/publication-tools.spec.ts`
- **文件类型**：测试模块
- **功能定位**：回归检查：引文解析、缩写作者、引用生成与教师高亮。
- **规模**：127 行，5946 字节
- **内容校验**：SHA-256 `8eb7a9e5237867e1ac8f9b9209fb1bae336b93bea32dc193d4dede8b5b12e6fe`

## 直接依赖

- `vitest`
- `../../shared/admin/publication-tools`

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## 验证内容

- normalizes DOI URLs and terminal punctuation
- parses common IEEE fields
- parses APA author, year, title and journal structure
- parses GB/T 7714 fields with Chinese punctuation
- parses Elsevier-style journal metadata
- parses BibTeX without changing the stored source text
- scores exact and unrelated titles safely
- generates four citation styles, BibTeX and homepage-teacher highlights
- formats Latin author names independently for IEEE, APA, Elsevier and GB/T 7714-2025
- warns when the homepage teacher does not match an author

运行：`pnpm exec vitest run tests/unit/publication-tools.spec.ts`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
