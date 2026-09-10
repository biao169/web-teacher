# app/components/public/auth/RegisterForm.vue

## 文件定位

- **源码路径**：`app/components/public/auth/RegisterForm.vue`
- **功能定位**：现有中英文注册表单；密码输入和默认长度提示改为6，移除常见密码及账号相似度提示，继续读取注册可用性。
- **规模**：100 行，5768 字节
- **内容校验**：SHA-256 `5665923f6a418c9e18cb960bf2f82a9ccde69423a3e02ebb25f78eccef6fa9a6`

## 使用与维护

现有中英文注册表单；密码输入和默认长度提示改为6，移除常见密码及账号相似度提示，继续读取注册可用性。

## 直接依赖

- `@lucide/vue`
- `~~/shared/contracts/interactions`
- `~~/shared/utils/redirect`
- `~/utils/interaction-errors`

本轮实现与验证详见 `docs/45_顶部账号按钮与六位密码.md`。
