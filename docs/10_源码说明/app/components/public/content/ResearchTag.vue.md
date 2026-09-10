# app/components/public/content/ResearchTag.vue

## 文件定位

- **源码路径**：`app/components/public/content/ResearchTag.vue`
- **功能定位**：研究名称标签为单条复制提供上下文，名称旁保留勾选和复制按钮，复制反馈在标签内换行显示；不重新引入概览说明或展开解释。
- **规模**：37 行，2241 字节
- **内容校验**：SHA-256 `67c0ba01fdd5c6c9c5d6318850a3ff6a5b18d2bfc0e75d12ff6f5865234a8a21`

## 使用与维护

研究名称标签为单条复制提供上下文，名称旁保留勾选和复制按钮，复制反馈在标签内换行显示；不重新引入概览说明或展开解释。

命名函数：`changeSelection`。

## 直接依赖

- `vue`
- `~~/shared/contracts/public-content`
- `~/composables/usePublicSelection`
- `~/composables/usePublicListReturn`
- `~~/shared/utils/public-detail-link`
- `./CopyRecordButton.vue`
- `./CopyPrepared.vue`
- `~/composables/usePublicCopy`

本步说明见 `docs/39_前台改版_一键复制.md`。一键复制已在第7步实施；真实浏览器与系统剪贴板验收属于第8步。
