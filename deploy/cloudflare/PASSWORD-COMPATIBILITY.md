# 统一密码第二步：适配器与调用入口核对

公共规则：backend/app/security/passwords.py，PBKDF2-HMAC-SHA256，100000 次，32 字节摘要；盐为 secrets.token_hex(16) 返回的 32 字符 ASCII 文本。派生时使用该文本的 ASCII 字节，不能在某个平台改成十六进制解码后的 16 字节。

密码统一使用 UTF-8，不自动做 Unicode 规范化。存储格式为 pbkdf2_sha256$100000$盐$Base64摘要。没有旧次数兼容或自动降级逻辑。

| 调用入口 | 使用路径 |
| --- | --- |
| Windows / Ubuntu / Debian 网站 | backend/app/native/runtime.py → Passwords(LocalKDF()) |
| 本地命令行创建管理员 | backend/cli.py → Passwords(LocalKDF()) |
| Cloudflare Worker | backend/entrypoints/worker.py → Passwords(derive)，部署生成的资源工厂复用同一源码 |
| 网页初始化 / 登录 / 修改密码 | backend/app/native/auth.py → 注入的 passwords.hash / verify |
| 公开注册 | backend/app/native/public_actions.py → r.passwords.hash |
| 后台创建账号 / 设置密码 | backend/app/native/content.py → self.auth.passwords.hash |

本地适配器 backend/app/adapters/sqlite/passwords.py 调用 hashlib.pbkdf2_hmac；Workers 适配器 backend/app/adapters/worker_crypto/passwords.py 调用 Web Crypto。两者参数已一致，无需修改生产适配器或另建密码服务。

验证命令（Python + Node）：

```sh
python -B -m unittest discover -s tests -p "test_password*.py" -v
```

本轮 5 项测试通过。固定向量覆盖 ASCII、中文、emoji、组合字符及长 UTF-8 密码；真实本地适配器与 Node Web Crypto 派生结果一致，并完成两个方向的哈希验证及错误密码拒绝。测试执行原 Worker derive 函数，但 js/pyodide 数据传递使用替身；它验证算法与编码兼容，不等于真实 Cloudflare/Pyodide 或 Windows 实机验收。缺少 Node 时兼容测试标记跳过，不可算作通过。

数据库结构未变。第三步已修复 /setup 的 Referrer-Policy 和错误提示，详见 README 中初始化修复说明。当前代码生成的同格式密码可跨平台验证，部署后需继续验证实际平台登录。无旧密码迁移要求。


## 第四步补充验证

在临时 Worker 产物目录，使用锁定 Pyodide Python 实际执行 ffi_probe.py：原 Worker derive 函数、真实 Python/JavaScript 数据传递及 Web Crypto 的 100000 次固定摘要验证通过。D1/R2 探针使用本地 JavaScript 替身，不访问线上资源。此前 Node 比较的传输替身局限已补充验证，但仍不是实际 Cloudflare 线上验收。

新增改密回归验证新密码可登录、旧密码被拒绝、旧会话撤销，存储参数保持 100000。
