# app / components / admin / shared / AdminMediaPreview.vue

## 文件定位

- **源码路径**：`app/components/admin/shared/AdminMediaPreview.vue`
- **文件类型**：Vue 组件
- **功能定位**：透明无边框的图片、视频与文档预览；图片/视频 contain 居中，解析对象键、管理本地 URL、失败提示和重试。
- **规模**：150 行，6496 字节
- **内容校验**：SHA-256 `87beb925041005a553ab846b385cc206ca873c839906f56c987df711456cac8a`

## 直接依赖

- `~/composables/useLatestRequest`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `source` | computed 派生状态，第 51 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `mime` | computed 派生状态，第 52 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `kind` | computed 派生状态，第 53 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `fallback` | computed 派生状态，第 59 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `label` | computed 派生状态，第 60 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `isLoading` | computed 派生状态，第 61 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `canRetry` | computed 派生状态，第 62 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `statusText` | computed 派生状态，第 63 行 | 根据组件输入和响应式状态计算当前显示值；随依赖变化自动更新。 |
| `revokeLocalUrl` | 函数，第 65 行 | 文件内部的 `revokeLocalUrl` 实现；按下方完整调用签名传入参数，参与本文件“透明无边框的图片、视频与文档预览；图片/视频 contain 居中，解析对象键、管理本地 URL、失败提示和重试。”所述流程。 |
| `useFile` | 函数，第 70 行 | 文件内部的 `useFile` 实现；按下方完整调用签名传入参数，参与本文件“透明无边框的图片、视频与文档预览；图片/视频 contain 居中，解析对象键、管理本地 URL、失败提示和重试。”所述流程。 |
| `resolveObjectKey` | 函数，第 78 行 | 文件内部的 `resolveObjectKey` 实现；按下方完整调用签名传入参数，参与本文件“透明无边框的图片、视频与文档预览；图片/视频 contain 居中，解析对象键、管理本地 URL、失败提示和重试。”所述流程。 |
| `mediaLoaded` | 函数，第 104 行 | 文件内部的 `mediaLoaded` 实现；按下方完整调用签名传入参数，参与本文件“透明无边框的图片、视频与文档预览；图片/视频 contain 居中，解析对象键、管理本地 URL、失败提示和重试。”所述流程。 |
| `mediaFailed` | 函数，第 109 行 | 文件内部的 `mediaFailed` 实现；按下方完整调用签名传入参数，参与本文件“透明无边框的图片、视频与文档预览；图片/视频 contain 居中，解析对象键、管理本地 URL、失败提示和重试。”所述流程。 |
| `retry` | 函数，第 114 行 | 文件内部的 `retry` 实现；按下方完整调用签名传入参数，参与本文件“透明无边框的图片、视频与文档预览；图片/视频 contain 居中，解析对象键、管理本地 URL、失败提示和重试。”所述流程。 |

### 调用签名

- `source`：`source = computed(() => localUrl.value || props.src?.trim() || resolvedUrl.value)`
- `mime`：`mime = computed(() => props.file?.type || props.mimeType?.trim() || resolvedMime.value)`
- `kind`：`kind = computed<'image' | 'video' | 'pdf' | 'file'>(() => {`
- `fallback`：`fallback = computed(() => props.fallbackText?.trim() || (kind.value === 'pdf' ? 'PDF' : kind.value === 'video' ? '视频' : kind.value === 'file' ? '文件' : '暂无图片'))`
- `label`：`label = computed(() => props.alt?.trim() || props.objectKey?.trim() || fallback.value)`
- `isLoading`：`isLoading = computed(() => resolving.value || props.loading)`
- `canRetry`：`canRetry = computed(() => props.retryable && !isLoading.value && (failed.value || Boolean(failureText.value) || (props.expected && !source.value)))`
- `statusText`：`statusText = computed(() => isLoading.value ? '载入中' : failureText.value || (failed.value ? ˋ${fallback.value}加载失败ˋ : fallback.value))`
- `revokeLocalUrl`：`function revokeLocalUrl(): void`
- `useFile`：`function useFile(file: File | null): void`
- `resolveObjectKey`：`async function resolveObjectKey(): Promise<void>`
- `mediaLoaded`：`function mediaLoaded(): void`
- `mediaFailed`：`function mediaFailed(): void`
- `retry`：`function retry(): void`

## 模板接入

子组件：原生 HTML 元素。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
