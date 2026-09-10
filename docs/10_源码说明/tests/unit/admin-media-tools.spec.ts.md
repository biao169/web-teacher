# tests / unit / admin-media-tools.spec.ts

## 文件定位

- **源码路径**：`tests/unit/admin-media-tools.spec.ts`
- **文件类型**：测试模块
- **功能定位**：回归检查：裁剪坐标和媒体缺失时的中英文文字规则。
- **规模**：37 行，1947 字节
- **内容校验**：SHA-256 `8dbe839453ba58fba80f60c95f6dd760813752d2a9945a88db5649d9ab2d8b77`

## 直接依赖

- `vitest`
- `../../app/admin/media-crop`
- `../../app/utils/media-fallback`

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## 验证内容

- fits common ratios inside the source and clamps the selected focus
- keeps the same source anchor while zoom changes the crop size
- maps a click in the preview back to a stable source focus
- uses Chinese compound surnames and English family names
- uses a bounded first category and editor-aware labels

运行：`pnpm exec vitest run tests/unit/admin-media-tools.spec.ts`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
