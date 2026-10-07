# 第四步：正文、对端读取和媒体流

## 实现范围

在新模块第三步基础上新增传输链路，没有参考旧网站源码。保留授权、单租约、
原子进度、退避和无限慢重试机制。下列类是可运行适配器，不是挂到网站上的正式服务。

| 层 | 文件 | 本步行为 |
| --- | --- | --- |
| 协议 | transport/protocol.py | 小请求、响应签名，清单大小、字段数、文件数上限 |
| 本地网络 | transport/http.py、server.py | 真实 HTTP 收发；生产只允许配置的 HTTPS 对端；本地回环测试需显式开启 |
| Worker 网络 | worker/transport.mjs、adapters/worker_peer.py | WebCrypto、小正文有界读取；媒体保留原生流 |
| 执行阶段 | adapters/transfer.py | 固定来源清单，一轮一个正文片段/媒体操作，完整后才能进入 apply |
| 本地媒体 | adapters/local_media.py | 私有暂存目录，固定 64 KiB 存储段，有界 socket 读取和 fsync；完成后保留不可变 object |
| Worker 媒体 | worker/r2_media.mjs、adapters/worker_media.py | create/resume/uploadPart/complete/head/abort，持久化 upload ID 与 part 回执 |
| 发布 | adapters/tasks.py | 业务语句、item applied、关联 files published、任务进度同批提交 |
| 迁移 | database/schema.sql、deploy/migrations.py | schema 1/2 → 3，活动旧任务暂停，数据保留 |

## 每轮工作及资源边界

正文原始字节不在片段边界解码。manifest_json 最大 8192 字节，最多 32 个字段、
16 个媒体描述。正文总计最多 200000 字节；单次正文 256–65536 字节，取任务当前值。
每轮读取数据库中持久化的偏移，因此 1024 字节缩为 256 字节不会重复或跳过数据。
来源的字段/文件清单同版本必须不可变；清单与媒体意图原子落库。

HTTP 控制请求最大 2048 字节，响应元数据最大 2048 字节。拒绝压缩正文、异常范围、
缺少长度、签名不符、版本不符和重定向。500/429/502/503/504 视为暂时资源错误；
平台产生的 1102 错误页不会当作同步数据解析。401/403、签名/版本冲突暂停任务。
只因错误页出现“1102”文字不能推断真实故障原因；没有声称可消除平台资源限制。

媒体单文件目前为 1 字节至 20 MiB；空文件描述明确拒绝。
R2 非末尾存储段固定 5 MiB。它不是正文 slice_bytes：不能缩为 256 字节，否则违反
R2 multipart 规则。原生流直接交给 uploadPart，不 arrayBuffer、不全文件哈希、
不在 Python 循环搬运媒体。遇到失败重传当前未确认的存储段，已确认段不回退。
本地媒体每次读取最多 min(slice_bytes,65536) 字节；文件存储段固定 64 KiB。

参考：Cloudflare R2 Workers API，https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
实际 CPU/内存峰值必须在第五/七步绑定真实环境后测量，Node 替身不能证明云端配额通过。

## 签名与信任边界

每对站点配置独立的至少 32 字节随机密钥，通过 secret_ref 由宿主读取，不入任务表。
请求签名覆盖协议名、时间戳、随机 nonce、POST、固定路径以及请求字节摘要。
请求允许 ±120 秒时钟偏差。响应覆盖 nonce、状态、原始元数据头以及小正文摘要。
媒体响应覆盖版本、offset、length、total，以 `stream` 代替全媒体摘要；媒体内容完整性
依赖 HTTPS 传输和可信源站不可变版本约定，并非端到端逐字节内容哈希。

接口 `/sync/v1/read` 只读，重放同一读取不会写入目标站；因此不额外维护 nonce 数据库。
提案创建、接收授权、管理命令不通过这个只读接口开放。不要将它扩成未保护的远程写 API。
`source.authorize(module,record)` 必须按该对端的出站范围检查权限；接收站授权仍由 Tasks
即时校验。source.manifest/slice/media 必须检查来源版本；media 返回已经校验版本和大小、
定位好范围的打开句柄，不能把用户输入作为本地路径。生产 HTTPS 在独立服务/可信代理终止。

## 接到执行器

```python
repo = Tasks(db, platform='local')
peer = HTTPPeer(configured_origin, secret_bytes)
media = LocalMedia(repo, private_staging_directory)
handlers = {
    'discover': bounded_discovery_handler,
    'transfer': Transfer(repo, peer, media),
    'apply': trusted_business_apply_handler,
    'cleanup': Cleanup(repo, media),
}
engine = Engine(repo, handlers, clock)
```

discover 与 apply 由网站业务适配器提供；第四步没有猜测教师网站各业务表的结构。
apply 每次调用 ctx.commit_item(item_id, server_built_statement)，业务语句需含目标版本条件，
并把已验证的唯一 object key 写入业务记录。外部请求不能提供 SQL。
正文可在数据库内按 offset 拼接后解码；不要从 D1 拉完整个任务所有正文。
提交要求关联媒体全部 uploaded/published；文件 published 与业务更新同事务，无“先发布后补回执”。

Worker 使用 WorkerPeer/WorkerMedia，对应 JS SignedPeer/R2Media。宿主负责将小字典转换为
JS 对象、把结果转换回 Python，保留 PeerError.kind；媒体流不经过桥接。生产 FFI 绑定、
Worker 入口、定时调度、源站业务适配器和部署配置在第五步接入，本步没有伪装这些已部署。

## 故障恢复

- 正文保存后丢回执：偏移和进度同事务，下次读持久化偏移继续。
- 媒体段流中断：不记 part 回执；本地临时文件删除，R2 重试同 part number。
- 本地 part 写成后数据库丢回执：校验私有路径的归属/大小，复用完整 part，不重复网络读取。
- R2 part 成功但回执未保存：同版本同 part 重传；只有数据库确认后才增加进度。
- 文件 complete 成功后丢回执：本地核对 object；R2 HEAD 核对操作、来源版本和大小后恢复。
- 业务提交后丢回执：item applied/files published 已原子保存，重放不重复业务写入。
- 取消：等旧租约退出后清理未发布的自有暂存；published 对象保留。本地已发布 part 副本删除。
- 有持久化进度就清零连续无进度失败；仅网络成功、建立上传 ID 或尝试本身不计字节进度。

未知归属的文件/对象拒绝发布和删除。外部存储操作无法和数据库共事务；过期执行器可能
留暂存孤儿，但不能越过当前授权/租约写业务引用。孤儿扫描、私有目录/桶生命周期配置
属于第五/六步清理集成。R2 createMultipartUpload 成功但 ID 回执丢失可能产生孤儿上传，
需桶的未完成上传生命周期回收。过期/丢失 upload ID 的明确错误归一化与重建策略仍需
真实 R2 环境核验；本步不会把任意网络异常误判为“上传不存在”并清空已确认进度。
本地私有目录必须由服务账号独占，不能与可写网站上传目录混用。

## 数据库和迁移

唯一 SQL 是 database/schema.sql。sync_items 新增 manifest_json；sync_files 新增 item_id、
source_file_id。schema_v1.json/schema_v2.json 是旧结构指纹，不是第二套初始化 SQL。
初始化、重复检查、明确旧版迁移均已测试。迁移前备份；未知结构停止；活动旧任务暂停。
旧无清单的部分正文不能继续拼接新来源，应新建任务。部署控制器尚在第五步接入。

## 验证边界与下一步

完整结果见 step4-results.json。覆盖实际本地 HTTP 与跨 Python/JS 签名通信、中文跨字节
边界、缩片、来源变更、媒体中断、回执丢失、权限撤销、事务回滚和媒体发布保留。
D1/R2 使用绑定替身；未连接两端真实网站、未部署 Cloudflare、未测前台 p95 延迟。

第五步完成独立 Worker / Ubuntu-Debian 后台运行入口、原生绑定、部署前检验和网站业务
适配器接线；第六步接入共用管理后台；第七步做真实云端资源与网页响应验收。
