# tests/unit/admin-specialist-editor.spec.ts

## 文件定位

- **源码路径**：`tests/unit/admin-specialist-editor.spec.ts`
- **功能定位**：后台媒体、翻译与权限编辑完整流程的四项测试，保留全部版本冲突、输入保留、确认取消、恢复与保存断言；两组多步骤测试使用15秒独立时限，避免共享CI下默认5秒超时，其他测试不放宽。
- **规模**：143 行，9562 字节
- **内容校验**：SHA-256 `3d2c8f2cd3fcd501ee8b8eaef0c0755f1dff3ff2e30453ddb5ef2857687ee870`

## 使用与维护

后台媒体、翻译与权限编辑完整流程的四项测试，保留全部版本冲突、输入保留、确认取消、恢复与保存断言；两组多步骤测试使用15秒独立时限，避免共享CI下默认5秒超时，其他测试不放宽。

命名函数：`settle`、`calls`、`button`、`fill`、`mount`。

## 直接依赖

- `vitest`
- `vue`
- `vue-router`
- `element-plus`
- `../../app/components/admin/complete/AdminCompleteAuthWorkspace.vue`
- `../../app/components/admin/complete/AdminCompleteMediaWorkspace.vue`
- `../../app/components/admin/complete/AdminCompleteTranslationWorkspace.vue`

本步说明见 `docs/40_前台改版_综合验收与交付.md`。本轮执行工程验收；真实浏览器访问受环境安全策略阻止，系统剪贴板与实机视觉仍未覆盖，静态规范检查遗留问题单列。
