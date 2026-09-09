# shared/utils/text-highlight.ts

## 文件定位

- **源码路径**：`shared/utils/text-highlight.ts`
- **功能定位**：安全文本高亮：较长候选优先、保留APA姓名逗号边界、避免词内/复合姓误中；NFC匹配映射回原文，保留重音、空白与标点。
- **规模**：64 行，3344 字节
- **内容校验**：SHA-256 `d30821eafca6afcf90b1d6607a9ba24b06e51daae9040a800fd8fb83639f8b46`

## 使用与维护

安全文本高亮：较长候选优先、保留APA姓名逗号边界、避免词内/复合姓误中；NFC匹配映射回原文，保留重音、空白与标点。

命名函数：`normalizedCandidates`、`isLatinWord`、`wordCharacter`、`validBoundary`、`escaped`、`splitHighlightedText`。

## 直接依赖

由框架、模板或样式机制接入。

本步说明见 `docs/26_前台论文引文展示验收.md`；第7步已按最新范围完成统一复制与滚动加载，Word专项适配已取消；第8步首页与详情整合待执行。
