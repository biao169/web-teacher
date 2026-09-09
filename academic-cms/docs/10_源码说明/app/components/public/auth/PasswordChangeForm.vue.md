# app/components/public/auth/PasswordChangeForm.vue

## 文件定位

- **源码路径**：`app/components/public/auth/PasswordChangeForm.vue`
- **功能定位**：现有中英文改密表单；新密码与确认输入的最小长度改为6，与服务端统一。
- **规模**：9 行，3452 字节
- **内容校验**：SHA-256 `e0ea42fabc151fbecff5ee07486f45c8933c9894bf06fb4aaf4d093a0d3f1f64`

## 使用与维护

现有中英文改密表单；新密码与确认输入的最小长度改为6，与服务端统一。

## 直接依赖

- `@lucide/vue`
- `~~/shared/utils/redirect`
- `~/utils/interaction-errors`

本轮实现与验证详见 `docs/45_顶部账号按钮与六位密码.md`。
