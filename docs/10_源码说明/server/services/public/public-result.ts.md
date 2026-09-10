# server/services/public/public-result.ts

## 文件定位

- **源码路径**：`server/services/public/public-result.ts`
- **功能定位**：共用安全 JSON 归一化、响应 ETag 和缓存策略；新增 freshPublicView 对选择结果按预算校验序列化，不使用缓存。
- **规模**：42 行，2164 字节
- **内容校验**：SHA-256 `84c4e49b52394d731c08419e34557a4a8f8c91d50ccba85c241a55ea5d54de77`

## 使用与维护

共用安全 JSON 归一化、响应 ETag 和缓存策略；新增 freshPublicView 对选择结果按预算校验序列化，不使用缓存。

命名函数：`freshPublicView`、`rememberPublicView`、`mediaBoundedCachePolicy`。

## 直接依赖

- `../../../shared/contracts/view-model`
- `../../cache/contracts`
- `../../cache/public-cache`
- `../../view-model/serializer`

本步说明见 `docs/25_前台多选与批量数据验收.md`；后续正式论文引文、第7步剪贴板复制与首页整合尚未完成。
