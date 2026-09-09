# app / components / admin / AdminSafeHtmlPreview.vue

## 文件定位

- **源码路径**：`app/components/admin/AdminSafeHtmlPreview.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台界面组件；构成后台导航、标题栏、状态反馈或内容管理交互。
- **规模**：7 行，861 字节
- **内容校验**：SHA-256 `aa469d79a0fb67d8b9ec928f34c008f09fce9850e08ac696ef7692fba33e697e`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `srcdoc` | computed 声明，第 3 行 | 派生 srcdoc 的响应式状态，供模板和交互逻辑读取 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `srcdoc`：`srcdoc=computed(()=>\`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https:; style-src…`

## Vue 模板交互

- 模板约 1 行；样式区约 2 行。
- 子组件：无显式 PascalCase 子组件标签。
- 事件绑定：无显式事件绑定。
- 动态属性：`srcdoc`
- 局部样式选择器：`body`、`img`、`pre`、`.safe-html-preview`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
