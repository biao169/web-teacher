# app / layouts / admin.vue

## 文件定位

- **源码路径**：`app/layouts/admin.vue`
- **文件类型**：Vue 组件
- **功能定位**：Nuxt 布局组件；定义页面级外壳、导航区域与全局样式装配。
- **规模**：21 行，1790 字节
- **内容校验**：SHA-256 `6d4c353e25ebb641e7558112b1c0fa1a8d468b07429c9cdf4a490050e7309123`

## 直接依赖

- `element-plus`
- `~/admin/element-plus-ts6`
- `element-plus/es/locale/lang/zh-cn`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `elementSize` | computed 派生状态，第 8 行 | 派生 element Size 的响应式状态，供模板和交互逻辑读取 |

### 调用签名

- `elementSize`：`elementSize = computed(() => ui.density === 'compact' ? 'small' : 'default')`

## 模板接入

子组件：`AdminSidebar`、`AdminTopbar`、`ElConfigProvider`、`ElDrawer`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
