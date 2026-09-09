# server/services/public/public-selection.ts

## 文件定位

- **源码路径**：`server/services/public/public-selection.ts`
- **功能定位**：选择能力、状态/响应契约或服务；新增论文可选citationStyle控制，具体实现见下文与直接依赖。
- **规模**：43 行，3585 字节
- **内容校验**：SHA-256 `2bf50b57f9fdf9dbba630f973919a1960b95998b359b5c683d0dcc3f9bd584d0`

## 使用与维护

选择能力、状态/响应契约或服务；新增论文可选citationStyle控制，具体实现见下文与直接依赖。

命名函数：`parsePublicSelectionRequest`、`readPublicSelection`。

## 新参数

只在publications（含精选归并）接受citationStyle，默认gbt，值固定四种；其他模块传入、重复数组或未知格式均拒绝。返回同一citationStyle及当前格式投影，继续private/no-store与1MB单批响应预算。

## 直接依赖

- `../../../shared/contracts/public-citation`
- `../../../shared/contracts/public-content`
- `../../../shared/contracts/public-selection`
- `./errors`
- `./public-query`
- `./public-result`
- `./public-values`

本步说明见 `docs/26_前台论文引文展示验收.md`；第7步已按最新范围完成统一复制与滚动加载，Word专项适配已取消；第8步首页与详情整合待执行。
