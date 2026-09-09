# db/read-plans.ts

## 文件定位

- **源码路径**：`db/read-plans.ts`
- **功能定位**：数据库首页读取计划，精选教师包含平台URL和可选数值，项目摘要包含原单位金额。
- **规模**：82 行，6274 字节
- **内容校验**：SHA-256 `0b0ba73d99d95d14b0b8801f0deaea8327ca01514bc0c2ab4f4e6d0fb6466dcd`

## 使用与维护

数据库首页读取计划，精选教师包含平台URL和可选数值，项目摘要包含原单位金额。

命名函数：`publicNavigationRead`、`homeRows`、`buildHomeReadPlan`、`buildTranslationReadPlan`、`readCurrentTranslations`。

## 直接依赖

- `./public-content-rules`
- `./codec`
- `./contracts`
- `./errors`
- `./models`
- `./query`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
