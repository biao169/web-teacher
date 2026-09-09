# app / composables / usePublicContentSeo.ts

## 文件定位

- **源码路径**：`app/composables/usePublicContentSeo.ts`
- **功能定位**：公开列表、详情及联系页 SEO 组合函数。
- **规模**：71 行，3496 字节
- **内容校验**：SHA-256 `3db8dcb43e7e96b018d0e6eb4eb17665ccd8c84f907230590e802a289e5141a9`

## 方法与函数

| 名称 | 用途与用法 |
| --- | --- |
| `usePublicContentSeo(metaInput, shellInput?)` | 接收值、ref 或 getter，通过 computed 保持标题、描述、Open Graph、Twitter 与语言链接响应式更新。地址规则调用 shared/utils/public-seo.ts。 |
| `safeJsonLd(value)` | 序列化面包屑结构化数据，转义 HTML 特殊字符和 Unicode 行分隔符；仅在配置绝对域名且有多层面包屑时输出。 |

## 配合关系与维护要求

首页通过 `usePublicSeo(() => data.value!)` 调用；内容页通过 metadata getter 调用。不读取 Host、转发头或访客 IP。全局站点名称与图片仍取现有网站设置/公开 shell。

当前 Unhead 的 `useHeadSafe` 会过滤 canonical。由可信域名和站内路由生成的 canonical/hreflang 通过 `useHead` 输出；关键词、favicon 和 JSON-LD 继续使用 `useHeadSafe`。生产 HTTP 回归逐个核对最终 HTML 的 canonical 与 XML 语言链接，不能只检查源码是否出现字符串。
