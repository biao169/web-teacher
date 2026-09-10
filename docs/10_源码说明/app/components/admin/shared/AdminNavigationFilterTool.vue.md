# app/components/admin/shared/AdminNavigationFilterTool.vue

## 文件定位

- **源码路径**：`app/components/admin/shared/AdminNavigationFilterTool.vue`
- **功能定位**：后台可视化筛选链接配置，说明已保存的导航条件会固定为前台搜索范围；未保存预览只验证条件结果。
- **规模**：150 行，9108 字节
- **内容校验**：SHA-256 `e38ebd8909a898296f81f185c594478fc3b46a195810161fe91a09d02154cca3`

## 使用与维护

后台可视化筛选链接配置，说明已保存的导航条件会固定为前台搜索范围；未保存预览只验证条件结果。

命名函数：`open`、`options`、`searchOptions`、`changeModule`、`apply`。

## 直接依赖

- `element-plus`
- `~/admin/element-plus-ts6`
- `~~/shared/contracts/public-content`
- `~~/shared/utils/public-list-link`
- `./AdminFormItem.vue`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
