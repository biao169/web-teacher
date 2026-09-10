# app/components/public/content/SelectionToolbar.vue

## 文件定位

- **源码路径**：`app/components/public/content/SelectionToolbar.vue`
- **功能定位**：保留已加载全选、已选/列表外计数、复制已选与清空，将原页面序号选项移到工具栏；一键复制、行内异常和取消勾选不可用条目，取消查看已选与编辑弹窗。
- **规模**：36 行，3332 字节
- **内容校验**：SHA-256 `e169685c43c52eea96cd5054847c12d587d3cce238d861320578e5335a97e2de`

## 使用与维护

保留已加载全选、已选/列表外计数、复制已选与清空，将原页面序号选项移到工具栏；一键复制、行内异常和取消勾选不可用条目，取消查看已选与编辑弹窗。

命名函数：`run`、`removeUnavailable`、`changePage`。

## 直接依赖

- `vue`
- `./CopyPrepared.vue`
- `~/composables/usePublicSelection`
- `~/composables/usePublicCopy`
- `~/composables/usePublicCitationStyle`
- `~~/shared/contracts/public-site`

本步说明见 `docs/39_前台改版_一键复制.md`。一键复制已在第7步实施；真实浏览器与系统剪贴板验收属于第8步。
