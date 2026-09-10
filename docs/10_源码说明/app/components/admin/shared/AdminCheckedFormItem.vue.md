# app / components / admin / shared / AdminCheckedFormItem.vue

## 文件定位

- **源码路径**：`app/components/admin/shared/AdminCheckedFormItem.vue`
- **文件类型**：Vue 组件
- **功能定位**：项目支持文件；按所在目录承担配置、数据或运行支持职责。
- **规模**：81 行，3984 字节
- **内容校验**：SHA-256 `9d42df3aaaf3a1a7565ef062474fd06c330a23c0e2765e2bda81f189d20fd1bf`

## 直接依赖

- `element-plus`
- `./AdminFormItem.vue`
- `~/admin/errors`
- `~~/shared/admin/identity`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `rule` | computed 派生状态，第 28 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `checkable` | computed 派生状态，第 29 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `check` | 函数，第 38 行 | 文件内部的 `check` 实现；按下方完整调用签名传入参数，参与本文件“项目支持文件；按所在目录承担配置、数据或运行支持职责。”所述流程。 |

### 调用签名

- `rule`：`rule = computed(() => adminDuplicateRule(props.resource, props.field))`
- `checkable`：`checkable = computed(() => typeof props.value === 'string' && props.value.trim().length > 0)`
- `check`：`async function check(): Promise<void>`

## 模板接入

子组件：`AdminFormItem`、`ElButton`、`ElTag`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
