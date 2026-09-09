# app / pages / en / setup.vue

## 文件定位

- **源码路径**：`app/pages/en/setup.vue`
- **功能定位**：en 语言的管理员初始化入口。
- **规模**：6 行，278 字节
- **内容校验**：SHA-256 `69c7c672c4d41cfc145aace9797a595a3bc6a7d772beca1c53a74a367b42e5cb`

## 方法与函数

| 名称 | 用途与用法 |
| --- | --- |
| `script setup` | useSeoMeta 设置 noindex,nofollow；页面复用 AdminBootstrapForm；HTTP 层再通过 nuxt.config.ts 的 noIndexDocumentHeaders 限制索引。 |

## 配合关系与维护要求

页面布局和业务数据接口保持复用；本次只调整 SEO 接入。
