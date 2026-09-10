# tests / unit / admin-errors.spec.ts

## 文件定位

- **源码路径**：`tests/unit/admin-errors.spec.ts`
- **文件类型**：测试模块
- **功能定位**：验证 H3 错误解包、故障状态和本地媒体错误说明的显示优先级。
- **规模**：28 行，1457 字节
- **内容校验**：SHA-256 `95a8b62272435ef994a9ae03bce0361b55a410b1ec7ada2d92dd2b89e1d13675`

## 直接依赖

- `vitest`
- `../../app/admin/errors`

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## 验证内容

- unwraps an H3 permission error without treating it as a generic server failure
- keeps a genuine server fault as a server fault
- preserves local upload explanations and prioritizes structured API messages

运行：`pnpm exec vitest run tests/unit/admin-errors.spec.ts`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
