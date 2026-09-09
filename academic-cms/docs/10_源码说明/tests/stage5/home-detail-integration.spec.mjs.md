# tests/stage5/home-detail-integration.spec.mjs

## 文件定位

- **源码路径**：`tests/stage5/home-detail-integration.spec.mjs`
- **功能定位**：首页与详情整合回归：精选教师、公开联系人、真实总数、稳定编号和研究全文；无公开精选教师时验证空人物。
- **规模**：54 行，4064 字节
- **内容校验**：SHA-256 `0c646ee86eead7c913fa9e436bb3ecfe37a73d10b25cb72f77401ea28bcdebff`

## 使用与维护

首页与详情整合回归：精选教师、公开联系人、真实总数、稳定编号和研究全文；无公开精选教师时验证空人物。

## 直接依赖

- `node:assert/strict`
- `node:test`
- `../helpers/offline-stage5.mjs`
- `../helpers/offline-stage4.mjs`

本步说明见 `docs/35_前台改版_首页教师与快捷入口.md`。筛选简化、卡片、研究标签和一键复制继续按第4–7步实施；真实浏览器视觉验收属于第8步。
