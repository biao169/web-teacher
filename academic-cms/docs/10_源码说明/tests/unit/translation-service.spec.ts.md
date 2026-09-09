# tests/unit/translation-service.spec.ts

## 文件定位

- **源码路径**：`tests/unit/translation-service.spec.ts`
- **功能定位**：真实SQLite回归追加2200字段全扫描、失败队列不阻塞后续待处理项、重试时间和执行中暂停；翻译服务商使用替身。
- **规模**：172 行，11305 字节
- **内容校验**：SHA-256 `c30b947cba8766fcd06077bca8f2d1009e7b3489a6163c256b32cc7afb2136e0`

## 使用与维护

真实SQLite回归追加2200字段全扫描、失败队列不阻塞后续待处理项、重试时间和执行中暂停；翻译服务商使用替身。

## 直接依赖

- `node:sqlite`
- `node:path`
- `vitest`
- `h3`
- `../../server/utils/complete-admin/auth`
- `../../server/utils/complete-admin/db`
- `../../scripts/db/migrations.mjs`
- `../../server/services/complete-admin/translation-service`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
