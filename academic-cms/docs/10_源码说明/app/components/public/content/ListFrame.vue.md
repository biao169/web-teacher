# app/components/public/content/ListFrame.vue

## 文件定位

- **源码路径**：`app/components/public/content/ListFrame.vue`
- **功能定位**：全部列表共用分页、筛选、多选和返回地址容器；新增可选标签展示模式，只改变容器排布，其他模块仍使用卡片布局。
- **规模**：28 行，2380 字节
- **内容校验**：SHA-256 `27c426a6ae2ff2603c824bb0004faa03f136efbb297c0d38ef0c75e6db6d009b`

## 使用与维护

全部列表共用分页、筛选、多选和返回地址容器；新增可选标签展示模式，只改变容器排布，其他模块仍使用卡片布局。

## 直接依赖

- `~~/shared/contracts/public-content`
- `vue`
- `~/composables/usePublicListReturn`
- `~/composables/usePublicSelection`
- `./SelectionToolbar.vue`
- `./LoadMore.vue`
- `~/composables/usePublicInfiniteList`

本步说明见 `docs/38_前台改版_研究方向标签化.md`。一键复制继续按第7步实施；真实浏览器视觉验收属于第8步。
