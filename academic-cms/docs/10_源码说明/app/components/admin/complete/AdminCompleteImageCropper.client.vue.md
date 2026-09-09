# app / components / admin / complete / AdminCompleteImageCropper.client.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteImageCropper.client.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台专项工作区组件；承载不能由通用 CRUD 表单覆盖的完整业务交互。
- **规模**：242 行，10560 字节
- **内容校验**：SHA-256 `76c77f65ed0b2261bfaf241fad7c3f3a9a14e1177fffd7e2a20c2028f60f0e24`

## 直接依赖

- `../shared/AdminFormItem.vue`
- `element-plus`
- `~/admin/media-crop`

## 直接调用方

- `app/components/admin/complete/AdminCompleteMediaWorkspace.vue`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `cleanup` | 函数 | 移除或失效 cleanup，同时处理相关联状态 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `draw` | 函数 | 封装 draw 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `load` | 函数 | 加载并刷新 load，同步界面或运行时状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `crop` | 函数 | 封装 crop 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `cleanup`：`function cleanup()`
- `draw`：`function draw()`
- `load`：`async function load()`
- `crop`：`async function crop()`

## Vue 模板交互

- 模板约 17 行；样式区约 1 行。
- 子组件：`ElDialog`、`ElForm`、`AdminFormItem`、`ElInputNumber`、`ElSlider`、`ElRadioGroup`、`ElRadioButton`、`ElButton`
- 事件绑定：`update:model-value → emit(`、`click → emit(`、`click → crop`
- 动态属性：`model-value`、`min`、`max`、`step`、`loading`
- 局部样式选择器：`.crop-layout`、`.preview`、`.preview canvas`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。

## 本轮字段统一

2026-09-06：本文件涉及的表单标题改为复用 `AdminFormItem`；控件和业务提交方法保持原有职责。批量编辑通过共享字段描述符和 `AdminFieldRenderer` 渲染。验收范围与待验项目见 `docs/15_后台统一字段标题与批量编辑验收.md`。
