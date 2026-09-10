# server/services/public/public-home-store.ts

## 文件定位

- **源码路径**：`server/services/public/public-home-store.ts`
- **功能定位**：首页快照读取，完整教师简介及平台链接、项目金额透传；继续保留公开性和排序约束。
- **规模**：241 行，10466 字节
- **内容校验**：SHA-256 `9410e438086cc83021a3c5fbb04a9712a29ab6fd780210e5476284e6fdeafcd3`

## 使用与维护

首页快照读取，完整教师简介及平台链接、项目金额透传；继续保留公开性和排序约束。

命名函数：`requiredTimestamp`、`site`、`navigation`、`profile`、`research`、`publication`、`project`、`news`。

## 直接依赖

- `./public-profile-links`
- `../../../shared/contracts/public-content`
- `../../view-model/serializer`
- `../../../shared/contracts/public-site`
- `../../../db/read-plans`
- `../../../db/contracts`
- `./errors`
- `./public-row`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
