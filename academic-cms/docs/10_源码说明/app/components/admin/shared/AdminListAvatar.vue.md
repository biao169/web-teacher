# app / components / admin / shared / AdminListAvatar.vue

## 文件定位

- **源码路径**：`app/components/admin/shared/AdminListAvatar.vue`
- **文件类型**：Vue 组件
- **功能定位**：后台共享界面组件；统一列表、编辑器、操作按钮或字段控件的交互与样式。
- **规模**：57 行，1866 字节
- **内容校验**：SHA-256 `f09cf21fb0f232a1832326132bcf171eb76565f6d5800eafde3dc7419fc20f60`

## 直接依赖

- `~~/shared/contracts/media`
- `~/utils/media-fallback`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `source` | computed 派生状态，第 12 行 | 派生 source 的响应式状态，供模板和交互逻辑读取 |
| `alt` | computed 派生状态，第 13 行 | 派生 alt 的响应式状态，供模板和交互逻辑读取 |
| `initials` | computed 派生状态，第 14 行 | 提取名的首字母并保留所需缩写标点。 |

### 调用签名

- `source`：`source = computed(() => props.media?.available && props.media.kind === 'image' ? props.media.url : null)`
- `alt`：`alt = computed(() => props.media?.alt?.trim() || (typeof props.name === 'string' ? props.name.trim() : '') || '人员照片')`
- `initials`：`initials = computed(() => mediaSurnameFallback(props.name) || '?')`

## 模板接入

子组件：原生 HTML 元素。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
