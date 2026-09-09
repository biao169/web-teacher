# server/routes/api/v1/public/students.get.ts

## 文件定位

- **源码路径**：`server/routes/api/v1/public/students.get.ts`
- **功能定位**：公开HTTP路由，在服务端解析保存的导航固定范围后读取列表或候选；保持公共输入检查与错误响应，不允许候选查询扩大基准条件。
- **规模**：8 行，570 字节
- **内容校验**：SHA-256 `3bea09c37f67042cd2f0846af5b544dd9eb76eb2ac9276dd517d38e9d5195559`

## 使用与维护

公开HTTP路由，在服务端解析保存的导航固定范围后读取列表或候选；保持公共输入检查与错误响应，不允许候选查询扩大基准条件。

## 直接依赖

- `h3`
- `../../../../services/public/public-navigation-scope`
- `../../../../utils/database`
- `../../../../utils/public-http`
- `../../../../utils/public-runtime`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
