# app / pages / zh / setup.vue

## 文件定位

- **源码路径**：`app/pages/zh/setup.vue`
- **功能定位**：zh 语言的管理员初始化入口。
- **规模**：6 行，272 字节
- **内容校验**：SHA-256 `970daa5777dd9b87f61b09418ece67c1e3edb41dadd3f685cf6d163cd67b5b3a`

## 方法与函数

| 名称 | 用途与用法 |
| --- | --- |
| `script setup` | useSeoMeta 设置 noindex,nofollow；页面复用 AdminBootstrapForm；HTTP 层再通过 nuxt.config.ts 的 noIndexDocumentHeaders 限制索引。 |

## 配合关系与维护要求

页面布局和业务数据接口保持复用；本次只调整 SEO 接入。
