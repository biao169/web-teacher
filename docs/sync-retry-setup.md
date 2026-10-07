# 同步快速重试与秒级唤醒

## Cloudflare 网页部署

继续使用现有 Workers Builds 项目，构建命令 `python build.py check`，部署命令 `python build.py deploy`（项目原有根目录设置保持不变）。上传本版完整源码后重新构建。无需 GitHub Actions。

构建环境沿用现有配置：`TEACHER_SYNC_EXECUTOR_MODE=inline` 为主站和原生辅助共两个 Worker；`separate` 为主站、原生辅助、独立同步执行器共三个 Worker。原有 `CLOUDFLARE_ACCOUNT_ID`、`TEACHER_AUX_API_TOKEN` 及数据库/媒体桶等配置继续使用，令牌必须具有目标账户 Workers Scripts 编辑权限。同步密钥继续从后台设置，或使用原有部署密钥。

本次没有新增必须手填的快速重试环境变量。程序自动完成：

1. 在原生辅助 Worker 导出 `SyncCoordinator`，添加 SQLite Durable Object 绑定 `SYNC_COORDINATOR`，首次执行 `teacher-sync-alarm-v1` 类迁移。
2. 发布主站及需要的同步执行器。
3. 最后添加原生辅助的私有 Service Binding `SYNC_RUNNER`：inline 指向主站，separate 指向独立同步执行器，避免首次创建时引用不存在的 Worker。
4. 保留已有 Cron 作为故障兜底。不要删除主站 `TransferCoordinator`，它属于文件快传模块。

在 Cloudflare 网页核对原生辅助 Worker 的绑定：`SYNC_COORDINATOR → SyncCoordinator`，`SYNC_RUNNER → 正确的主站或同步执行器`，以及原有 D1/R2。辅助 Worker 仍关闭公开 workers.dev/预览访问。新 DO 会使用平台 Durable Objects 配额；准确配额与费用以账户套餐为准。

部署若在中途失败，修正提示后重新运行同一部署命令即可；程序核对现有迁移标记，不重复创建 DO 类，也不会删除原有 DO。不要手动删除 namespace 来规避报错。

## 后台配置

进入“网站同步”，找到“快速重试等待（秒）”，默认 10，可设 10～300。保存后，现有任务下一次失败就使用新值，不需要重建任务或重新部署。

每项任务的快速重试次数仍独立配置。超出次数后采用任务的慢速等待，最多 1800 秒。出现持久化进度就清零连续失败计数，不因累计失败次数终止任务。已异常排到更远未来的失败任务会被后台修正；定时计划自身的每天/每周周期不会因此改变。

创建、继续或取消任务会请求唤醒调度器；失败时任务仍然保存，由 Cron 接手。Alarm 到期是目标时间，不保证精确到秒。每次唤醒只推进一个环节，不用长循环或 sleep 占住 Worker。若执行器调用本身连续失败，调度器采用独立退避，最多半小时；任务租约始终阻止重复写入。

## Ubuntu / Debian

更新源码并重启原有站点服务即可，使用同一个后台重试配置。Linux 继续由本地后台循环检查到期任务，不需要 Durable Objects。其检查周期和正在执行的任务可能使实际启动略晚于目标时间。

## 应急暂停与验证

仍支持 `TEACHER_SYNC_PAUSED=1`。在实际执行同步的 Worker 配置并部署，或在 Linux 服务环境配置并重启。暂停阻止新推进，保留任务和断点；恢复改为 `0`。

部署后创建小范围拉取任务，查看推进序号、下一次执行和执行日志；短暂断网或对端不可用后应自动重试，恢复后继续推进。手动暂停/取消应停止后续业务写入。若辅助发布、权限或平台额度异常，检查 Workers 日志；不要把本地测试通过视为线上额度验证通过。
