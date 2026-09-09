# tests/unit/public-list-link.spec.ts

## 文件定位

- **源码路径**：`tests/unit/public-list-link.spec.ts`
- **功能定位**：公开筛选链接编码与语言切换回归，新增带冒号导航UID的等价编码不跳转、中文条件与默认页仍规范化、重复参数拒绝。
- **规模**：84 行，6568 字节
- **内容校验**：SHA-256 `12ffd024fd6845bc79775d67830e7f67ef9eac28a6c484a77e6929797530ec94`

## 使用与维护

公开筛选链接编码与语言切换回归，新增带冒号导航UID的等价编码不跳转、中文条件与默认页仍规范化、重复参数拒绝。

## 直接依赖

- `vitest`
- `../../shared/utils/public-list-link`
- `../../shared/utils/public-path`
- `../../shared/utils/locale-path`
- `../../server/services/public/public-query`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
