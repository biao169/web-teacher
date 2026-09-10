# server/routes/api/v1/public/filter-options.get.ts

## 文件定位

- **源码路径**：`server/routes/api/v1/public/filter-options.get.ts`
- **功能定位**：公开HTTP路由，在服务端解析保存的导航固定范围后读取列表或候选；保持公共输入检查与错误响应，不允许候选查询扩大基准条件。
- **规模**：21 行，1617 字节
- **内容校验**：SHA-256 `30bbb87891b5d4710ca1a1785449e9acd3ce896a7ecc43cdb0a3c894d1fc43a7`

## 使用与维护

公开HTTP路由，在服务端解析保存的导航固定范围后读取列表或候选；保持公共输入检查与错误响应，不允许候选查询扩大基准条件。

## 直接依赖

- `../../../../services/public/public-navigation-scope`
- `h3`
- `../../../../../shared/utils/public-list-link`
- `../../../../services/public/public-content-store`
- `../../../../services/public/public-query`
- `../../../../services/public/errors`
- `../../../../utils/public-http`
- `../../../../utils/database`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
