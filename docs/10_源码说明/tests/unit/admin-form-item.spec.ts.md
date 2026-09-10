# tests / unit / admin-form-item.spec.ts

## 文件定位

- **源码路径**：`tests/unit/admin-form-item.spec.ts`
- **文件类型**：测试模块
- **功能定位**：项目支持文件；按所在目录承担配置、数据或运行支持职责。
- **规模**：54 行，3020 字节
- **内容校验**：SHA-256 `317fc05c2d3293d015121f7081da9460d65c68cb573aa94fba8665cf68ce15d6`

## 直接依赖

- `vitest`
- `vue`
- `element-plus`
- `../../app/components/admin/shared/AdminFormItem.vue`

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## 验证内容

- keeps label association, required validation and custom actions when wrapping Element Plus
- preserves rule-based required state, explicit overrides and a separate corresponding-author mark

运行：`pnpm exec vitest run tests/unit/admin-form-item.spec.ts`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
