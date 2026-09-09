# server/services/complete-admin/translation-service.ts

## 文件定位

- **源码路径**：`server/services/complete-admin/translation-service.ts`
- **功能定位**：扫描按表、记录及字段游标连续前进，并分页校准失效缓存；队列查询在截断前排除退避、租约与达到重试上限的记录，返回续跑数量和重试时间，保留执行中发生的暂停。
- **规模**：581 行，42362 字节
- **内容校验**：SHA-256 `a011a1ed6f590117d5b277ec2975ceb6b98bdc0d84850febf923839a61cff227`

## 使用与维护

扫描按表、记录及字段游标连续前进，并分页校准失效缓存；队列查询在截断前排除退避、租约与达到重试上限的记录，返回续跑数量和重试时间，保留执行中发生的暂停。

## 直接依赖

- `h3`
- `../../../shared/admin/translation`
- `./translation-provider`
- `~~/shared/complete-admin/core.mjs`
- `~~/shared/admin/suggestion-tools`
- `../../../db/contracts`
- `../../i18n/fingerprint`
- `../../i18n/source-ref`
- `../../utils/complete-admin/auth`
- `../../utils/complete-admin/db`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
