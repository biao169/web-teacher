# tests/stage5/query-plans.spec.mjs

## 文件定位

- **源码路径**：`tests/stage5/query-plans.spec.mjs`
- **功能定位**：直接对八类实际生成SQL执行查询计划检查，区分索引直接排序与表达式临时排序成本。
- **规模**：64 行，4118 字节
- **内容校验**：SHA-256 `5dbaaaffb0ee0a34689293a11e964fdbd3c39f51178f63d30318f0828cf91c7a`

## 使用与维护

直接对八类实际生成SQL执行查询计划检查，区分索引直接排序与表达式临时排序成本。

命名函数：`plan`、`assertIndexed`。

## 直接依赖

- `node:assert/strict`
- `node:test`
- `node:fs/promises`
- `node:path`
- `../helpers/offline-stage5.mjs`
- `\.\/public-row`
- `\.\/public-localization`
- `\.\/public-values`

本步说明见 `docs/29_前台双语性能与兼容验收.md`；第9步已完成双语、性能及能力回退自动化验证；第10步综合验收与交付。Word专项已取消。
