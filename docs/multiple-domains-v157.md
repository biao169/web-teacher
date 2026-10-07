# v0.15.157：第三步，多域名访问

基于本轮 v0.15.156 完整源码。保留独立 site_sync 模块、原始 SVG/PNG、Apple 图标和社交数值显示；不修改数据库结构和既有数据。

## 配置约定

```dotenv
TEACHER_ORIGIN=https://www.example.com
TEACHER_ALLOWED_ORIGINS=https://www.example.com,https://example.com,https://teacher.example.net
```

TEACHER_ORIGIN 仍是主域名，用于 canonical、robots 和 sitemap。主域名自动加入允许列表；省略新变量兼容原单域名部署。运行时接受逗号、空白分隔或 JSON 字符串数组，总计最多 32 个地址、字符串最多 4096 字符。填写完整 HTTPS origin，不带路径、查询、账户信息或通配符；国际域名使用 punycode。HTTP 仅用于本机开发，不能混用 HTTP/HTTPS。

多个域名访问同一套网站和数据。Cookie 不设置 Domain，各域名分别登录。登录、注册、联系表单、后台保存、同步管理、初始化和快传仍校验当前请求域名与 Origin 一致，并保留已有 CSRF/权限校验。两个允许域名之间也不能跨域提交；未放行 Host 被拒绝，不信任客户端传入的 X-Forwarded-Host 来扩展列表。

## Cloudflare Worker

在 Worker 的变量中配置上述两个变量；每个自定义域名还必须完成 DNS、证书和 Worker 域名绑定。仅添加变量不会创建绑定。

使用项目构建部署流程时，同时在构建环境提供 TEACHER_ALLOWED_ORIGINS，避免再次发布覆盖运行变量。可额外设置：

```dotenv
TEACHER_CUSTOM_DOMAINS=www.example.com,example.com,teacher.example.net
```

构建流程为显式指定的自定义域名生成 routes，并将其加入允许列表。原 TEACHER_CUSTOM_DOMAIN 保持兼容。需要 workers.dev 地址时将完整地址加入允许列表，并保留 workers_dev 开启；不要把 workers.dev 填入自定义域名列表。直接生成 Worker 包时可用 `--allowed-origins` 参数。

## Ubuntu / Debian

新安装：在原 install.sh 或 install-multi.sh 安装命令中追加：

```sh
--allowed-origins 'https://www.example.com,https://teacher.example.net'
```

已安装且已升级到本版管理器的实例：

```sh
sudo tweb domains --allowed-origins 'https://www.example.com,https://teacher.example.net'
```

多实例使用该实例的管理入口或原有 `--instance` 参数。主域名沿用安装时的 domain，上述命令不更换主域名。传入空字符串可恢复仅主域名。管理器保存域名列表到状态和环境配置，更新 Caddy/nginx 示例，重启应用并检查健康状态；失败时回滚配置、状态和环境文件权限。调整端口时保留域名列表。

使用 `tweb proxy` 查看生成配置，完成外部代理、DNS、证书配置并检查后自行重载代理。生成的 nginx 片段包含 server_name，需要放入相应 server 块。此命令不自动改写或重载外部代理。通过管理器管理的实例应使用上述命令维护列表，避免仅手改环境变量后被配置重建覆盖。

## 主要文件

- `backend/app/security/origins.py`、`backend/app/security/http.py`：解析、Host 与同源校验。
- `backend/app/native/web.py`、`backend/app/native/public_auth.py`：后台和公共写入校验。
- `backend/entrypoints/worker.py`：读取 Worker 绑定变量。
- `transfer/backend/integration.py`、`deploy/cloudflare/runtime/transfer.py`、`deploy/cloudflare/runtime/setup.py`：快传与初始化使用当前允许域名。
- `deploy/shared/worker_package.py`、`deploy/cloudflare/domains.py`、`deploy/cloudflare/pipeline.py`：发布变量和多个自定义绑定。
- `deploy/vps/release.py`、`deploy/linux/tweb.py`、`install.sh`、`install-multi.sh`：Linux 配置、代理模板和管理入口。
- `tests/test_allowed_origins_v157.py`、`tests/test_domain_deploy_v157.py`：运行流程、拒绝场景、配置生成和回滚验证。

## 验证范围

自动化验证使用本地 HTTP 测试客户端、SQLite、模拟 Worker 适配器和隔离的 Linux 管理目录；包含双域名登录、保存、同步页与监控、快传上传下载、注销、Cookie 隔离、canonical、初始化及部署配置。未连接真实 Cloudflare 账户或生产 VPS，不代表已完成线上 DNS、TLS、代理验收。准确测试结果见同目录 multiple-domains-v157-tests.json。

下一步为第四步：日志容量、保留时间、轮转清理与管理入口；随后处理自适应缓存和响应速度。
