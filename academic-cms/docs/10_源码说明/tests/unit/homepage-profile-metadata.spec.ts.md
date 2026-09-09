# tests/unit/homepage-profile-metadata.spec.ts

## 文件定位

- **源码路径**：`tests/unit/homepage-profile-metadata.spec.ts`
- **功能定位**：使用内存SQLite执行后台主页教师姓名提取SQL，验证与前台相同的公开启用精选条件、稳定排序和空结果。
- **规模**：28 行，1830 字节
- **内容校验**：SHA-256 `47c7749ab45124bb855c6a9e6c2f3224e247592952ec0820afabea7e74cb6b01`

## 使用与维护

使用内存SQLite执行后台主页教师姓名提取SQL，验证与前台相同的公开启用精选条件、稳定排序和空结果。

## 直接依赖

- `vitest`
- `node:sqlite`
- `h3`
- `../../server/services/complete-admin/metadata-service`

本步说明见 `docs/35_前台改版_首页教师与快捷入口.md`。筛选简化、卡片、研究标签和一键复制继续按第4–7步实施；真实浏览器视觉验收属于第8步。
