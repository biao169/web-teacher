# app/components/public/content/RecordRow.vue

## 文件定位

- **源码路径**：`app/components/public/content/RecordRow.vue`
- **功能定位**：共用紧凑条目组件；支持末行标签和正文插槽，保留选择、原编号、详情返回和一键复制能力。
- **规模**：70 行，4137 字节
- **内容校验**：SHA-256 `ee6980a98e692ab5e19421bb834081e5cf89a869aba2e5291175faec433f2f23`

## 使用与维护

共用紧凑条目组件；支持末行标签和正文插槽，保留选择、原编号、详情返回和一键复制能力。

命名函数：`changeSelection`。

## 直接依赖

- `~~/shared/contracts/public-site`
- `vue`
- `~/composables/usePublicListReturn`
- `~~/shared/utils/public-detail-link`
- `./CopyRecordButton.vue`
- `./CopyPrepared.vue`
- `~/composables/usePublicCopy`
- `../ui/Badge.vue`
- `~/composables/usePublicSelection`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
