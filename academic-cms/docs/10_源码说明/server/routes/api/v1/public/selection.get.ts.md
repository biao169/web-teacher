# server/routes/api/v1/public/selection.get.ts

## 文件定位

- **源码路径**：`server/routes/api/v1/public/selection.get.ts`
- **功能定位**：GET /api/v1/public/selection：校验模块/语言/UID，分派已有公开服务，统一错误边界；响应 private/no-store/max-age=0。
- **规模**：14 行，764 字节
- **内容校验**：SHA-256 `e33a4a902bf06e72dd95dc2d66216bafb62af53d9e2164a4137426a63aa73c5e`

## 使用与维护

GET /api/v1/public/selection：校验模块/语言/UID，分派已有公开服务，统一错误边界；响应 private/no-store/max-age=0。

## 直接依赖

- `h3`
- `../../../../services/public/public-selection`
- `../../../../utils/public-http`
- `../../../../utils/public-runtime`

本步说明见 `docs/25_前台多选与批量数据验收.md`；后续正式论文引文、第7步剪贴板复制与首页整合尚未完成。
