# CPU / Pyodide 线上验收

此补丁完成本地测试与打包检查，不代表已经修复线上 CPU 超限或 Pyodide 内部错误。不重置 D1/R2，不改变套餐或 CPU 限额。

## 部署与日志

1. 将完整更新包的源码同步到 web-py 分支。根目录 deploy/cloudflare、构建 python build.py check、部署 python build.py deploy 和现有构建变量保持不变。
2. 等待发布成功，核对活动版本与提交。打开该 Worker 的实时日志，在网页访问站点；控制台访问日志可关联 Ray ID。需要持久日志时，检查账号下 Workers Logs/Observability 是否开启及采样情况。
3. 日志 component=teacher-worker，patch=cloudflare-cpu-step4。INIT-SITE 和 INIT-COORDINATOR 按实例首次使用出现；分阶段 INIT-RESOURCES、INIT-MAIN、INIT-SETUP、INIT-TRANSFER 输出 START/OK/ERROR。普通 FETCH/COORDINATOR-FETCH 只输出异常。CRON 输出 OK、SKIPPED 或 ERROR。
4. ERROR 包含异常类型与文件/行号/函数栈，最多 3 层异常链、每层 12 帧。不输出异常原文、源码行、局部变量、请求地址、Cookie、令牌或正文。平台自身日志由平台管理，不受这段应用日志过滤控制。

elapsed_ms 是事件墙钟耗时，不是 CPU 时间。部署快照中不读取时钟、不生成日志。若平台在进入 Python 处理器前失败，或 CPU 强制终止导致来不及打印 ERROR，应用日志可能缺失；需结合平台异常、CPU 指标及最后一条 START 判断，不能把“没有 ERROR”当作成功。

## 验收顺序

| 操作 | 预期 |
| --- | --- |
| 新版本首次访问首页、登录 | INIT-SITE 成功，不出现该主站实例的 INIT-TRANSFER |
| 重复访问首页与登录 | 页面正常；同一实例不重复初始化。平台分配新实例时允许再次出现 INIT-SITE |
| 访问 /setup | 未配置初始化密钥或已有管理员时 404 属正常；只在需要初始化时使用现有安全流程 |
| 首次访问 /transfer/ | 协调侧 INIT-COORDINATOR 与 INIT-TRANSFER 成功 |
| 登录后台访问 /admin/transfer | 保留嵌入管理界面和权限检查 |
| 两个浏览器收发 | 测试码接收、局域网/中继状态及连续请求，不把门户 GET 成功当作传输验收 |
| 等待下一次 Cron | OK 或 SKIPPED；interval、disabled、not-initialized、busy 均有具体原因；不构建 HTTP 应用 |

可在本地运行 GET 检查（无需 Cloudflare 凭据）：

```sh
python deploy/cloudflare/smoke.py --origin https://web-teacher.2948531734.workers.dev --repeat-startup
```

此脚本记录 HTTP 状态、总耗时、可识别的 1101/1102 和 CF-Ray；不输出响应正文。它不保证制造冷启动，也不验证管理员操作、真实文件收发或 Cron。首次 GET /transfer/ 可能触发原有默认设置初始化。

## 根据结果定位

- INIT-RESOURCES ERROR：查看资源模块导入及模板准备的异常类型/位置。
- INIT-MAIN 或 INIT-TRANSFER 未完成：结合对应请求的 CPU 时间、限额和平台栈判断；START 无 OK 不足以单独确认 CPU 超限。
- INIT 已完成，FETCH ERROR：故障位于后续请求或转发链；不要重新初始化数据库。
- CRON ERROR：按帧位置区分绑定、D1、R2、清理业务；保留既有租约/检查点，不通过清库处理。
- 平台显示 CpuLimitExceeded：记录 Workers 套餐、CPU 限额、实际 CPU 使用及活动提交。调整初始化降低开销不保证适配任意套餐。
- CPU 超限消失但仍出现 promising task 重入：保留首次完整平台异常、活动提交及依赖锁版本，再制作最小复现验证 SDK/Pyodide 兼容性；不要盲目串行化所有请求或自动重复请求。

提供诊断时只需阶段日志、平台异常、CPU 指标和活动版本；不要提供密码、Cookie、Secret 或数据库内容。
