# app / admin / icons.ts

## 文件定位

- **源码路径**：`app/admin/icons.ts`
- **文件类型**：程序模块
- **功能定位**：后台前端基础模块；提供 API、格式化、权限反馈或统一列表等通用能力。
- **规模**：11 行，888 字节
- **内容校验**：SHA-256 `48883bdcf03703d35a1ccfb2295828c474364297c1744fe7bd94b0417fb2f431`

## 直接依赖

- `@lucide/vue`
- `vue`
- `~~/shared/admin/registry`

## 直接调用方

- `app/components/admin/SidebarNavigation.vue`
- `app/pages/admin/index.vue`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `ADMIN_ICONS` | 导出常量，第 4 行 | 提供 ADMIN ICONS 的共享配置或不可变数据 |
| `FALLBACK_ADMIN_ICON` | 导出常量，第 10 行 | 提供 FALLBACK ADMIN ICON 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
