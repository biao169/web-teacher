# server/routes/api/v1/public/news/[slug]/pdf.get.ts

## 文件定位

- **源码路径**：`server/routes/api/v1/public/news/[slug]/pdf.get.ts`
- **功能定位**：新闻PDF稳定读取入口，每次请求重新核对新闻公开性和当前附件引用，再签发内部媒体授权并复用Range响应；响应不缓存，隐藏/移除后旧链接失效。
- **规模**：34 行，2952 字节
- **内容校验**：SHA-256 `d21acf2772784edc35c4948b1db48ac245a13858a57232a1dd08e54ed6b2bc9b`

## 使用与维护

新闻PDF稳定读取入口，每次请求重新核对新闻公开性和当前附件引用，再签发内部媒体授权并复用Range响应；响应不缓存，隐藏/移除后旧链接失效。

## 直接依赖

- `h3`
- `../../../../../../utils/database`
- `../../../../../../utils/media-runtime`
- `../../../../../../utils/media-http`
- `../../../../../../media/errors`
- `../../../../../../services/public/public-content-store`
- `../../../../../../services/public/public-content-blocks`
- `../../../../../../services/public/public-values`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
