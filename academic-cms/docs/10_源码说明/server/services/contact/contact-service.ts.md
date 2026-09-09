# server/services/contact/contact-service.ts

## 文件定位

- **源码路径**：`server/services/contact/contact-service.ts`
- **功能定位**：普通与新闻留言共用服务，重新核对新闻公开/发布时间/留言开关；正文附加服务器确认的新闻来源并保留原文，审计记录结构化关联信息。
- **规模**：167 行，7597 字节
- **内容校验**：SHA-256 `80ea618cdff891410278ff04d7306e39d2b21d234dd7a41a24a80a081015aa15`

## 使用与维护

普通与新闻留言共用服务，重新核对新闻公开/发布时间/留言开关；正文附加服务器确认的新闻来源并保留原文，审计记录结构化关联信息。

## 直接依赖

- `../../../shared/contracts/interactions`
- `../../../shared/utils/unicode`
- `../../interactions/errors`
- `../../security/identity`
- `../auth/session-service`
- `../interactions/action-throttle-service`
- `../interactions/settings-store`
- `./contact-store`

本轮实现与验证详见 `docs/43_前台留言与请求稳定性修复.md`。
