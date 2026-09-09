# server/services/contact/contact-store.ts

## 文件定位

- **源码路径**：`server/services/contact/contact-store.ts`
- **功能定位**：读取可留言新闻，消息与审计在同一原子写入中重新核对匿名和新闻策略，防止提交期间关闭留言仍写入。
- **规模**：79 行，3235 字节
- **内容校验**：SHA-256 `d3878c73d118fecc86e78a9c104ac28e7c608aa5dda85c9553aa0beeddfbd331`

## 使用与维护

读取可留言新闻，消息与审计在同一原子写入中重新核对匿名和新闻策略，防止提交期间关闭留言仍写入。

## 直接依赖

- `../../../db/contracts`
- `../../../db/errors`
- `../../../db/query`
- `../../audit/commands`
- `../../interactions/errors`

本轮实现与验证详见 `docs/43_前台留言与请求稳定性修复.md`。
