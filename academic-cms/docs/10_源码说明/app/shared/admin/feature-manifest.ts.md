# app / shared / admin / feature-manifest.ts

## 文件定位

- **源码路径**：`app/shared/admin/feature-manifest.ts`
- **文件类型**：程序模块
- **功能定位**：后台前端共享定义；集中维护功能清单、字段规则或建议值。
- **规模**：33 行，3188 字节
- **内容校验**：SHA-256 `31ce8c989aeab619547d711bb05e63ba3020a7edc179a3fe796467afe66193c4`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `AdminFeatureManifestEntry` | 接口，第 1 行 | 约束 Admin Feature Manifest Entry 的数据结构或可选值 |
| `ADMIN_FEATURE_MANIFEST` | 导出常量，第 10 行 | 提供 ADMIN FEATURE MANIFEST 的共享配置或不可变数据 |
| `ADMIN_FEATURE_BY_PATH` | 导出常量，第 32 行 | 提供 ADMIN FEATURE BY PATH 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
