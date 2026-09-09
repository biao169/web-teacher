# 隔离测试示例

此目录可删除，不影响构建、启动、Cloudflare 部署和教师集成。脚本不操作真实域名或云端资源；生成独立测试账号与临时目录，结束后删除测试数据。

需要 Node.js 24.19.0 和 pnpm 11.19.0。在本工具根目录安装依赖后执行：

```bash
bash test-examples/run.sh
```

Windows 双击 `run.cmd`，或在终端执行 `test-examples\run.cmd`。

运行内容：锁文件安装、构建前台、既有单元/协议回归、Worker 干运行打包、启动隔离的 Node 和 Wrangler 本地运行时；检查初始化不可覆盖、来源/CSRF、成员权限、中继完整性、大于 4 MiB 暂存读写、撤销清理、退出登录与云端限额。

Wrangler 使用本机模拟 Durable Objects/R2，不向真实 Cloudflare 部署。测试占用 `18790`、`18791` 端口，应保持空闲；运行时需允许本机回环网络与子进程。真实浏览器中的目录保存兼容性、跨网 WebRTC、VPN 路由与 Cloudflare 线上账户额度仍需部署后验收。

手动只运行专项：`node test-examples/runtime-smoke.mjs`。测试不包含隐藏的固定生产管理员密码，凭证仅用于隔离实例。
