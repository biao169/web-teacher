# app/components/public/content/NewsBody.vue

## 文件定位

- **源码路径**：`app/components/public/content/NewsBody.vue`
- **功能定位**：新闻正文的可视区域懒加载组件，复用详情富文本块；避免重复请求，支持失败重试、切换语言取消和迟到结果丢弃。
- **规模**：48 行，2929 字节
- **内容校验**：SHA-256 `3469620590b9e6c4367ce66cddeae77d6654efa35bcc1e9dd97cc692d261dfe4`

## 使用与维护

新闻正文的可视区域懒加载组件，复用详情富文本块；避免重复请求，支持失败重试、切换语言取消和迟到结果丢弃。

命名函数：`cancel`、`load`、`observe`。

## 直接依赖

- `vue`
- `~~/shared/contracts/public-content`
- `./ContentBlocks.vue`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
