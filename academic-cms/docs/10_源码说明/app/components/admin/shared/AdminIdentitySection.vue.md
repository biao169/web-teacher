# app / components / admin / shared / AdminIdentitySection.vue

## 文件定位

- **源码路径**：`app/components/admin/shared/AdminIdentitySection.vue`
- **文件类型**：Vue 组件
- **功能定位**：共用稳定 UID 编辑区域；新建时生成建议值并允许自定义，已保存 UID 只读，复用查重与复制操作。
- **规模**：80 行，3281 字节
- **内容校验**：SHA-256 `15af6882e552b450ce3ec98426665c9f855d6922ceaf9c431f2dd469eec94211`

## 直接依赖

- `@lucide/vue`
- `element-plus`
- `~~/shared/admin/identity`
- `./AdminCheckedFormItem.vue`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `localError` | computed 派生状态，第 21 行 | 优先显示服务端错误，否则校验 UID 非空、ASCII 字符和长度。 |
| `regenerate` | 函数，第 28 行 | 仅在新建且可编辑时生成新的 UID 建议值并通知父编辑器。 |
| `copyUid` | 函数，第 32 行 | 复制当前 UID 到剪贴板，失败时提示手工复制。 |

### 调用签名

- `localError`：`localError = computed(() => {`
- `regenerate`：`function regenerate(): void`
- `copyUid`：`async function copyUid(): Promise<void>`

## 模板接入

子组件：`AdminCheckedFormItem`、`Copy`、`ElButton`、`ElInput`、`RefreshCw`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
