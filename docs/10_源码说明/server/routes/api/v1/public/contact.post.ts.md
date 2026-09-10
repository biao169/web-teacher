# server/routes/api/v1/public/contact.post.ts

## 文件定位

- **源码路径**：`server/routes/api/v1/public/contact.post.ts`
- **功能定位**：留言提交端点转交可选newsUid；继续执行会话、CSRF、来源、JSON大小及严格请求结构校验。
- **规模**：33 行，1518 字节
- **内容校验**：SHA-256 `a0d4852b6e32f36a9c6dab2f6d6dd8efd17d34eb942f1fd5383329a873df0cb4`

## 使用与维护

留言提交端点转交可选newsUid；继续执行会话、CSRF、来源、JSON大小及严格请求结构校验。

## 直接依赖

- `h3`
- `../../../../../shared/schemas/interactions`
- `../../../../utils/auth-http`
- `../../../../utils/auth-runtime`
- `../../../../utils/bounded-json`
- `../../../../utils/interaction-http`
- `../../../../utils/interaction-runtime`

本轮实现与验证详见 `docs/43_前台留言与请求稳定性修复.md`。
