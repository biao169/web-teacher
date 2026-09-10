# tests / unit / publication-metadata.spec.ts

## 文件定位

- **源码路径**：`tests/unit/publication-metadata.spec.ts`
- **文件类型**：测试模块
- **功能定位**：回归检查：查新源响应归一化、通讯作者和失败换源。
- **规模**：50 行，2781 字节
- **内容校验**：SHA-256 `e5cdb65107971ded5896ffb8d014a864d898b39fa4d52d68f8648e63ec034d48`

## 直接依赖

- `vitest`
- `../../server/services/complete-admin/metadata-service`

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## 验证内容

- maps explicit OpenAlex corresponding authors without guessing
- maps DataCite creator and ContactPerson metadata
- maps Europe PMC core metadata
- maps PubMed ESummary metadata

运行：`pnpm exec vitest run tests/unit/publication-metadata.spec.ts`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
