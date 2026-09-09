# app / components / public / MediaImage.vue

## 文件定位

- **源码路径**：`app/components/public/MediaImage.vue`
- **文件类型**：Vue 组件
- **功能定位**：公开站展示组件；渲染页面区块、内容列表、详情或通用视觉元素。
- **规模**：56 行，2068 字节
- **内容校验**：SHA-256 `e6f0754ec93276b47fef21286db8ea4c511a953929944d38b18a8ef8e38daacd`

## 直接依赖

- `@lucide/vue`
- `~~/shared/contracts/public-site`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `imageAvailable` | computed 派生状态，第 23 行 | 派生 image Available 的响应式状态，供模板和交互逻辑读取 |
| `fallbackText` | computed 派生状态，第 24 行 | 派生 fallback Text 的响应式状态，供模板和交互逻辑读取 |
| `fallback` | computed 派生状态，第 33 行 | 派生 fallback 的响应式状态，供模板和交互逻辑读取 |
| `alt` | computed 派生状态，第 34 行 | 派生 alt 的响应式状态，供模板和交互逻辑读取 |

### 调用签名

- `imageAvailable`：`imageAvailable = computed(() => props.media.available && props.media.kind === 'image' && !failed.value)`
- `fallbackText`：`fallbackText = computed(() => {`
- `fallback`：`fallback = computed(() => props.media.available ? 'placeholder' : props.media.fallback)`
- `alt`：`alt = computed(() => props.media.alt)`

## 模板接入

子组件：`ImageIcon`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
