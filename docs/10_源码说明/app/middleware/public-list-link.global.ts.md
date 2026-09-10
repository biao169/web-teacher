# app/middleware/public-list-link.global.ts

## 文件定位

- **源码路径**：`app/middleware/public-list-link.global.ts`
- **功能定位**：公开列表URL规范化中间件，比较查询参数的等价编码，避免Vue Router将导航UID冒号重建为未编码形式后产生重定向等待；旧中文筛选继续转为ASCII包。
- **规模**：11 行，483 字节
- **内容校验**：SHA-256 `4b7019c12708f43f8e3be0ccf313e53a70ca908990f66069de18655c46e736c0`

## 使用与维护

公开列表URL规范化中间件，比较查询参数的等价编码，避免Vue Router将导航UID冒号重建为未编码形式后产生重定向等待；旧中文筛选继续转为ASCII包。

## 直接依赖

- `~~/shared/utils/public-list-link`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
