# app / components / public / content / HighlightedText.vue

## 文件定位

- **源码路径**：`app/components/public/content/HighlightedText.vue`
- **文件类型**：Vue 组件
- **功能定位**：把文本按高亮词拆分为安全文本片段，使用模板渲染标记；不把用户字符串作为 HTML 注入。
- **规模**：14 行，664 字节
- **内容校验**：SHA-256 `18aabfdc949331b16d54868636784d22b656f83f11776ae56fc8b0e222e976b1`

## 直接依赖

- `~~/shared/utils/text-highlight`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `segments` | computed 派生状态，第 9 行 | 根据当前正文和高亮词计算供模板渲染的文本片段。 |

### 调用签名

- `segments`：`segments = computed(() => splitHighlightedText(props.text, props.highlights))`

## 模板接入

子组件：原生 HTML 元素。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
