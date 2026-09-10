# server/routes/api/v1/public/patents.get.ts

## 文件定位

- **源码路径**：`server/routes/api/v1/public/patents.get.ts`
- **功能定位**：公开HTTP路由，在服务端解析保存的导航固定范围后读取列表或候选；保持公共输入检查与错误响应，不允许候选查询扩大基准条件。
- **规模**：8 行，567 字节
- **内容校验**：SHA-256 `bfd3211e438c8189d1dc3b5ca36782f356b8792d8e64d108d8065b5cb62f64f1`

## 使用与维护

公开HTTP路由，在服务端解析保存的导航固定范围后读取列表或候选；保持公共输入检查与错误响应，不允许候选查询扩大基准条件。

## 直接依赖

- `h3`
- `../../../../services/public/public-navigation-scope`
- `../../../../utils/database`
- `../../../../utils/public-http`
- `../../../../utils/public-runtime`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
