# 第二步：快传并入主站（0.15.66）

## 已完成的范围

Windows/Linux 本地部署现在只有主站进程与主站端口（默认8003）。访问 `/transfer/`；管理 `/transfer/admin`；自己的任务 `/transfer/tasks`。`start-with-transfer.cmd` 保留为兼容入口，但与普通启动一样只启动主站。旧 `transfer.backend.vps` 明确拒绝启动，不会误开第二个监听服务。VPS配置生成器只生成一个systemd服务和主站反向代理。

快传沿用原Transfers、Management、Accounting、设置模板和分块文件存储。没有重写教师、论文等管理业务，没有使用Nuxt/Vue。原快传12张表增加到主站SQLite；`transfer_database_path` 仅用于识别旧迁移来源，不是活动数据库。没有根据旧管理员授权自动赋予主站角色权限。

| 能力 | 主站权限 |
|---|---|
| 登录后访问任务 | 有效主站会话；快传 `can_view` |
| 创建及继续上传 | `can_view` + `can_create`，仍受快传身份策略和额度控制 |
| 设置、全量任务控制、清理及缓存管理 | `can_view` + `can_edit` + `can_delete` 同时具备 |
| 匿名下载 | 沿用快传后台匿名接收策略、有效期和下载次数 |

每个请求重新读取主站用户、角色和会话；事务写入时再次检查会话、账号状态和权限。登出、禁用、降权会影响后续请求及尚未提交的写入。要求改密码的账号不能绕过主站限制。旧 `ft_session` 不再作为本地身份，`/transfer/bridge` 返回410。分页/预检签名绑定主站会话，不再需要独立桥接密钥。

已发送给浏览器的数据无法收回；下载中后续分块会在结算时复核权限。匿名允许下载时，未登录用户仍按匿名策略访问公开分享链接，这是原有设置的行为。

## 文件与配置

部署默认路径：

- 主站数据库、普通媒体及普通缓存：继续沿用原配置。
- 快传文件：`<教师网站根目录>/transfer-data/files/`。
- 快传辅助缓存：`<教师网站根目录>/transfer-data/cache/`。
- 迁移收据及两份数据库备份：由命令明确指定到源码和快传目录之外。

`TRANSFER_MEDIA_DIR` / `TRANSFER_CACHE_DIR` 或TOML对应项有显式设置时仍优先；迁移到新的默认根目录前要移除旧覆盖项。目录不能重叠。`transfer-data` 不挂载为静态目录；发布清单、ZIP、stage复制均排除它。数据库并不放入网站公开目录。

**升级代码时必须保留 `transfer-data`。** 新包不含真实文件。原地替换代码时保留该目录；切换整个release目录时，停服后将完整 `transfer-data` 复制到新release根目录并核验，再切换启动。不要用会删除未包含文件的镜像同步覆盖网站根目录。也可显式配置稳定的外部文件目录，但这就不是默认根目录布局。VPS服务账号需有快传目录写权限，生成的systemd配置只额外放行该目录；使用自定义目录时同步修改ReadWritePaths。

## 已有0.15.65主站与旧快传的升级

下面所有命令使用**原站实际Python环境及同一份TEACHER_CONFIG/TEACHER_DATA_DIR**，不要误指向新空数据库。先记录旧数据库、旧文件、旧缓存的真实绝对路径。

1. 停止旧主站与旧快传服务，保留0.15.65源码、原数据库、文件与配置。旧快传进程不再启动。迁移工具会获取两库运行锁；若任一个服务占用，拒绝操作。
2. 展开0.15.66到新的源码目录。保留主站数据库配置；去掉旧快传媒体/缓存目标覆盖，让目标变为新源码根目录的 `transfer-data`。来源仍通过下面命令单独指定。目标与来源目录必须互不重叠。
3. 对0.15.65主站直接执行导入，它同时完成新增表；不必先运行schema升级。示例（把路径换成真实路径）：

```text
python -m transfer.backend.migrate import --source-db "D:\teacher-data\transfer.sqlite3" --source-files "D:\teacher-data\transfer-media" --source-cache "D:\teacher-data\transfer-cache" --receipt "D:\teacher-backups\transfer-v66.json"
```

Linux示例：

```sh
python -m transfer.backend.migrate import --source-db /var/lib/teacher-transfer/transfer.sqlite3 --source-files /var/lib/teacher-transfer/media --source-cache /var/lib/teacher-transfer/cache --receipt /var/backups/teacher-site/transfer-v66.json
```

来源缓存目录必须存在；如果旧站从未创建缓存目录，核对确实没有缓存后先建立对应空目录。来源文件目录必须是真实旧文件目录，不能以空目录掩盖丢失文件。

工具识别精确旧schema、检查SQLite完整性，分别备份两库；按1MiB缓冲复制文件，逐块核验长度与SHA-256，复制元数据并核对表行数，最后在同一事务提交。已有任务ID、owner、分享令牌哈希、配额和过期时间保持原值。过期时间不会因迁移延期。旧 `admin_grants` 与历史记录保留，但在新本地服务中不产生管理员权限。

成功输出 `imported: true` 后，收据记录复制清单、摘要、行数和两份快照路径。原数据库和原文件不删除。迁移失败不会覆盖主站原数据；已复制但未引用的目标文件、已生成备份和收据保留供核对。修复问题后使用新的收据名重试；相同目标文件只有摘要一致才可复用，不同内容拒绝覆盖。未知schema、符号链接、文件缺失/损坏、目标已存在快传数据均拒绝自动合并。

4. 核对收据后启动主站，打开 `/transfer/`；管理员查看原任务、额度、设置并验证一次下载。旧快传数据库仍存在而无成功迁移标记时，仅快传入口提示503等待迁移，教师网站其他功能继续可用，避免悄悄初始化一个空快传。
5. 旧分享URL路径从旧域名 `/s/<token>` 变为主站 `/transfer/s/<token>`，令牌不变。VPS配置生成器可通过可选 `--transfer-domain` 生成旧域名到主站 `/transfer{uri}` 的HTTPS重定向，仍不运行第二个应用。没有旧域名重定向时，需重新分发新的主站链接。浏览器原独立域名的续传sessionStorage不会自动跨域迁移；已完成的任务和服务端检查点保留。

更早的已知主站结构先执行 `python -m backend.cli migrate` / `upgrade-data.cmd`，备份后补齐已有迁移及0014；然后执行以上快传导入。只有schema升级不会导入旧快传文件。当前新schema中快传表必须为空；工具拒绝覆盖已有新快传数据。此前没有使用快传、没有旧数据库的站点只需schema升级；首次访问快传才创建默认设置。

## 回滚

停服，在**开放新站写入之前**可执行：

```text
python -m transfer.backend.migrate rollback --receipt "D:\teacher-backups\transfer-v66.json"
```

它验证备份摘要、当前主站完整内容摘要，恢复导入前主站数据库；原旧快传库、原文件一直保留。随后切回原源码与原配置。复制到新目录的文件不自动删除。

主站在迁移后只要发生任何数据库写入（包括登录/会话续期），自动回滚就会拒绝，以免丢失新数据。此时应停服、完整备份新增数据并进行人工合并恢复，不能强行覆盖。若更早版本先运行过独立schema升级，导入回滚只能退回导入前的新schema；恢复更早版本还需使用schema升级生成的 `.before-v0.15.66.sqlite3` 快照，按实际备份和配置人工核对。

## 验证与边界

自动验证包含真实本机单进程HTTP启动/重启、同会话上传下载和计量、旧端口未监听；主站会话失效/降权、CSRF、旧授权不能提权；迁移成功、损坏/缺失/冲突/占用/未知schema、提交失败事务回滚、回滚拒绝覆盖新数据，以及前台路径前缀。所有验证使用临时合成数据，没有操作用户实际数据库。

全量首次422/424项Python通过；两项旧架构断言更新后，对应63项复测通过；最终整合集19项通过（含新增迁移下载与示例管理验证）。前端DOM160项全部通过。累计覆盖427项当前Python用例；没有将分次复测称为第二次全量运行。详情见 `transfer-integration-v66-verification.json`。Windows真实浏览器、远程VPS生产内存、LAN/WAN实传尚未验证。Cloudflare仍保留旧Worker适配和准备工具，本步骤**没有**完成Worker同入口/D1/R2整合；本地根目录与进程方案不能直接套用Worker。

当前仍为原临时分享模式、200MiB上限和现有手动清理。下一步实施大文件流式传输基础：传输状态、按需分页分块清单、接收确认和受控队列；局域网直传、广域网在线中转、离线自动清理分别按第四至第六步推进。
