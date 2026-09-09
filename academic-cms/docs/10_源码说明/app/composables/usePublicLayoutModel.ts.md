# app/composables/usePublicLayoutModel.ts

## 文件定位

- **源码路径**：`app/composables/usePublicLayoutModel.ts`
- **功能定位**：首页和所有内页统一读取公共shell接口，语言隔离缓存键；路由与筛选切换不更换页框数据源。
- **规模**：18 行，729 字节
- **内容校验**：SHA-256 `baa52fd948cd46616c26aa48c088913dbeabea6b7546978a9c28e87bc19aa6be`

## 使用与维护

首页和所有内页统一读取公共shell接口，语言隔离缓存键；路由与筛选切换不更换页框数据源。

命名函数：`usePublicLayoutModel`。

## 直接依赖

- `vue`
- `~~/shared/contracts/public-site`

本步说明见 `docs/34_前台改版_公共页框与导航.md`。首页人物、筛选简化、卡片和一键复制继续按第3–7步实施；真实浏览器视觉验收属于第8步。
