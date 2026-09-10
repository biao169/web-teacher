# tests / stage5 / global-numbering.spec.mjs

- **源码路径**：`tests/stage5/global-numbering.spec.mjs`
- **规模**：168 行，12667 字节
- **内容校验**：SHA-256 `c52676603f1b75a7ec3eef5f57a5c6dbf34a82a727917f19dc66bd379c0faa0f`

## 前台 2/10 当前实现（2026-09-06）

- `paper` 创建隔离论文夹具，`pairs` 提取 UID/展示号。SQLite 与 D1 协议替身各执行七组行为场景：筛选/精选/语言、增删/日期、分页/空值、模块公开范围、八模块契约、105 条研究方向、缓存失效。
- 性能场景用实际 SQLite 创建 20,000 条数据，记录执行计划与重复测量中位数，同时比较相关计数方案；不以易波动毫秒数作为硬阈值。
- 执行 `node scripts/run-stage5-tests.mjs`；禁止对用户业务数据库运行夹具。

本节更新早期签名和查询说明；专项行为与验证见 docs/22_前台列表_筛选前编号与分页验收.md。
