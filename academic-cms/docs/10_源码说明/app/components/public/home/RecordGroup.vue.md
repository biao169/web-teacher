# app/components/public/home/RecordGroup.vue

## 文件定位

- **源码路径**：`app/components/public/home/RecordGroup.vue`
- **功能定位**：首页分组共用多选与详情返回上下文；新增可选标签展示模式，继续按当前首页条目有界渲染，不额外请求全部数据。
- **规模**：12 行，1077 字节
- **内容校验**：SHA-256 `81b6f5eedd2f0e2af3e96c5eec07d84faa94a44456d179a31f8ab764a3af4821`

## 使用与维护

首页分组共用多选与详情返回上下文；新增可选标签展示模式，继续按当前首页条目有界渲染，不额外请求全部数据。

## 直接依赖

- `vue`
- `~/composables/usePublicSelection`
- `~/composables/usePublicListReturn`
- `../content/SelectionToolbar.vue`

本步说明见 `docs/38_前台改版_研究方向标签化.md`。一键复制继续按第7步实施；真实浏览器视觉验收属于第8步。
