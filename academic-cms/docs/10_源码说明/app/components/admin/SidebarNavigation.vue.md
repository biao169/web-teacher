# app / components / admin / SidebarNavigation.vue

## 文件定位

- **源码路径**：`app/components/admin/SidebarNavigation.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台界面组件；构成后台导航、标题栏、状态反馈或内容管理交互。
- **规模**：25 行，1647 字节
- **内容校验**：SHA-256 `c6906381b2ce2c3fcade9a8bf1b08418a85ef424af11c0dcbf700a219da2f399`

## 直接依赖

- `~/admin/icons`
- `~~/shared/admin/registry`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `active` | 函数，第 6 行 | 封装 active 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `active`：`function active(path: string): boolean`

## Vue 模板交互

- 模板约 17 行；样式区约 0 行。
- 子组件：`NuxtLink`
- 事件绑定：`click → emit(`
- 动态属性：`aria-label`、`key`、`class`、`to`、`title`、`aria-current`、`is`、`size`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
