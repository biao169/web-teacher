# tests / unit / admin-editor-fields.spec.ts

## 文件定位

- **源码路径**：`tests/unit/admin-editor-fields.spec.ts`
- **文件类型**：测试模块
- **功能定位**：回归检查：两套字段描述经统一适配后仍保持类型、约束、特殊控件与只读规则。
- **规模**：92 行，4481 字节
- **内容校验**：SHA-256 `d51591de9d65f66791e7a29122be6014b2cbc258458e39cc361ab641fb73907e`

## 直接依赖

- `vitest`
- `../../app/admin/editor-fields`
- `../../app/admin/complete-resource`
- `../../app/shared/admin/special-fields`
- `../../shared/admin/content-modules`
- `../../shared/complete-admin/core.mjs`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `completeResource` | 函数，第 13 行 | 测试辅助函数；准备受控数据、挂载组件或驱动 DOM/断言，具体覆盖见下方测试用例。 |

### 调用签名

- `completeResource`：`function completeResource(key: string): CompleteResourceSchema`

## 验证内容

- turns generic fields and their special capabilities into one UI contract
- turns complete-resource fields into the same UI contract and resolves aliases
- describes every field without dropping guidance or its schema identity
- marks category-like fields as reusable multi-value suggestions in both schema systems

运行：`pnpm exec vitest run tests/unit/admin-editor-fields.spec.ts`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
