# app / composables / usePublicSeo.ts

## 文件定位

- **源码路径**：`app/composables/usePublicSeo.ts`
- **功能定位**：首页 SEO 组合函数。
- **规模**：44 行，2268 字节
- **内容校验**：SHA-256 `8eaad8728c46fb979aa130254dbb62cc70553f04869a55a7d1ffc3b9480e0680`

## 方法与函数

| 名称 | 用途与用法 |
| --- | --- |
| `usePublicSeo(modelInput)` | 接收值、ref 或 getter，通过 computed 保持标题、描述、Open Graph、Twitter 与语言链接响应式更新。地址规则调用 shared/utils/public-seo.ts。 |

## 配合关系与维护要求

首页通过 `usePublicSeo(() => data.value!)` 调用；内容页通过 metadata getter 调用。不读取 Host、转发头或访客 IP。全局站点名称与图片仍取现有网站设置/公开 shell。

当前 Unhead 的 `useHeadSafe` 会过滤 canonical。由可信域名和站内路由生成的 canonical/hreflang 通过 `useHead` 输出；关键词、favicon 和 JSON-LD 继续使用 `useHeadSafe`。生产 HTTP 回归逐个核对最终 HTML 的 canonical 与 XML 语言链接，不能只检查源码是否出现字符串。
