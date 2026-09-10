# tests/unit/public-layout-model.spec.ts

## 文件定位

- **源码路径**：`tests/unit/public-layout-model.spec.ts`
- **功能定位**：路由切换回归：从首页到专利列表、筛选、详情再返回时页框请求与数据引用保持稳定；中英文切换使用不同缓存键。
- **规模**：32 行，1625 字节
- **内容校验**：SHA-256 `44f26b34c0917fc6aa113ffe8576ab1ed9981f19d4d4cac4ed372dd935e5f6c5`

## 使用与维护

路由切换回归：从首页到专利列表、筛选、详情再返回时页框请求与数据引用保持稳定；中英文切换使用不同缓存键。

## 直接依赖

- `vitest`
- `vue`
- `../../app/composables/usePublicLayoutModel`

本步说明见 `docs/34_前台改版_公共页框与导航.md`。首页人物、筛选简化、卡片和一键复制继续按第3–7步实施；真实浏览器视觉验收属于第8步。
