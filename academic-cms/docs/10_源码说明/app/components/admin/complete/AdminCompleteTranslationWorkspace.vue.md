# app/components/admin/complete/AdminCompleteTranslationWorkspace.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteTranslationWorkspace.vue`
- **功能定位**：翻译工作台新增自动运行至完成、停止自动运行和连续进度，保留单批、暂停、人工维护；明确离开页面停止调度。
- **规模**：575 行，39420 字节
- **内容校验**：SHA-256 `93e5027bdaaf9c2c68456b74498a910e501f91d7af6cf38592bdd2f520d63d84`

## 使用与维护

翻译工作台新增自动运行至完成、停止自动运行和连续进度，保留单批、暂停、人工维护；明确离开页面停止调度。

## 直接依赖

- `~/admin/translation-runner`
- `~/composables/useAdminEditorLifecycle`
- `element-plus`
- `~/admin/element-plus-ts6`
- `~/admin/errors`
- `~/admin/formatters`
- `~/admin/unified-list`
- `~~/shared/admin/registry`
- `~~/shared/admin/translation`
- `../shared/AdminDataTable.vue`
- `../shared/AdminListToolbar.vue`
- `../shared/AdminRowActions.vue`
- `../shared/AdminEditorShell.vue`
- `../shared/AdminFormItem.vue`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
