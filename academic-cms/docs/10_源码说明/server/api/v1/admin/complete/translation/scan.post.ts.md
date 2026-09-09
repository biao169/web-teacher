# server/api/v1/admin/complete/translation/scan.post.ts

## 文件定位

- **源码路径**：`server/api/v1/admin/complete/translation/scan.post.ts`
- **功能定位**：扫描接口接受有界游标，保持权限、CSRF和JSON大小限制，支持连续覆盖所有来源。
- **规模**：20 行，929 字节
- **内容校验**：SHA-256 `f520ce532fdc2802034d8a48942fea07149d643bdd2ef2abb4d7619b678b7919`

## 使用与维护

扫描接口接受有界游标，保持权限、CSRF和JSON大小限制，支持连续覆盖所有来源。

## 直接依赖

- `~~/server/utils/complete-admin/auth`
- `~~/server/services/complete-admin/translation-service`
- `~~/server/utils/complete-admin/api`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
