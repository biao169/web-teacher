# 媒体读取与预览简化（v0.15.112）

## 本次处理

原本本地媒体每读取 64 KiB 都重新解析路径、打开文件，并在读取前后对大小、inode、mtime、ctime 计算版本。预览接口还对已经存在的媒体使用固定 20 MiB 读取限制；历史错误后缀兼容仅覆盖图片；后台详情根据数据库类型选择预览元素。上述行为会增加读取开销，也可能阻止大文件或历史元信息不准确的媒体正常预览。由于未取得用户实际失败文件和请求记录，本版不把这些已确认的代码问题认定为其电脑上故障的唯一原因。

调整后：

- 先复用原来的媒体查看/公开引用权限检查，校验媒体目录边界，然后只打开一次本地文件。
- 文件大小、文件头和传输内容来自同一文件句柄。交给既有 StreamingResponse 及其线程池连续读取，每块最多 64 KiB；正常结束、异常和连接断开均关闭句柄。
- 不在读取过程中反复比较文件路径版本。核对、收录、删除仍保留原有严格的版本和引用检查；应用上传仍使用临时文件加原子替换。应用之外直接原地截断正在传输的文件仍会使该次请求失败，不应静默返回不完整内容。
- 移除流式读取的额外 20 MiB 门槛。后台上传设置、既有上传上限、媒体配额没有改变。R2 仍每块最多读取 1 MiB 并校验对象版本，不混合不同版本。
- 复用既有签名函数及类型表，识别 JPG/JPEG、PNG、GIF、WebP、PDF、MP4、WebM、ZIP。兼容支持类型的历史错误或缺失后缀，不使用任意数据库 MIME 开启内联显示。HTML、SVG、未知类型仍只作为附件。
- 后台详情按需检查实际类型以选择图片、视频或 PDF 元素，不改写数据库登记。详情及目录核对页仅展示配置媒体目录内的绝对磁盘路径；缺失文件显示预期位置，受禁止的链接或其他存储类型不显示伪造的本地路径。完整路径仅在已授权后台显示，不进入公共媒体响应。
- HEAD 只表明文件头可读取，提示不再把它当作完整预览成功。文件缺失、OS 读取权限和磁盘错误分别提示；图片和视频临时失败最多自动重试两次，保持手动重试/打开原文件功能。

## 修改文件

| 文件 | 作用 |
| --- | --- |
| `backend/app/native/media_response.py` | 一次打开、连续分块、句柄关闭、类型识别、明确的读取错误及详情辅助数据 |
| `backend/app/native/media_inventory_store.py` | 共用本地文件版本函数，提供受目录约束的打开及绝对路径方法 |
| `backend/app/native/media_audit.py` | 在当前报告页提供媒体绝对路径，兼容已有临时报告 |
| `backend/app/native/web.py` | 详情接入实际类型/路径；诊断 HEAD 可取得非敏感错误代码 |
| `frontend/admin/templates/native-media-parts.html` | 详情优先使用实际类型选择组件，呈现明确的读取错误 |
| `frontend/admin/templates/native-media-detail.html` | 绝对路径、实际类型及整数 KB 大小 |
| `frontend/admin/templates/native-media-audit.html` | 核对列表显示并展开完整媒体路径 |
| `frontend/admin/static/js/native-media.js` | 图片/视频错误分类与有界重试 |
| `frontend/admin/static/js/native.js`、`native-list.js`、`native-media-fields.js`、`native-media-links.js`、`native-media-picker.js` | 共用预览模块版本引用统一更新，避免多份模块状态 |
| `frontend/admin/static/css/native-media-preview.css` | 长路径换行与选择复制样式 |
| `tests/test_media_read_v112.py` | 多媒体读取、路径、权限、分段、资源释放及 R2 回归 |
| `tests/test_media_regression.py` | 更新大文件读取预期，继续保留原有读取和权限验证 |
| `tests/media-dom.test.cjs` | 增加磁盘错误及视频恢复/不支持编码的状态验证 |
| `tests/fixtures/media/*` | 自行生成的有效图片、PDF、MP4、WebM 小样本，不含用户数据 |
| `README.md`、`pyproject.toml`、`release-manifest.json`、本说明 | 使用说明、版本号与完整性清单 |

## 验证

- 81 项 Python 测试通过：新读取测试、媒体回归、媒体管理、公开附件权限。
- 16 项 DOM 测试通过：失败提示、最多两次重试、恢复状态、视频错误、并发诊断及销毁清理。
- 有效样本覆盖普通 JPEG、渐进 JPEG、CMYK JPEG、PNG、WebP、PDF、MP4、WebM；验证 HTTP 内容与原文件逐字节相同，类型正确，Range 区间正确，历史错误后缀和 MIME 下详情元素正确。
- 样本另经 Pillow、PDF 解码器和 FFmpeg 验证可以解码。它们只用于本次验证，不是网站新增运行依赖。
- 验证大于 20 MiB 文件的 HEAD 和尾部 Range 可读，同时上传大小设置仍生效。
- 验证未登录、未公开引用、路径逃逸、符号链接仍被阻止；正常读取、HEAD、无效 Range、连接断开均关闭句柄。
- R2 使用适配器替身验证有界读取和版本参数，未连接真实 R2。当前环境没有可用的浏览器二进制，本次没有声称完成真实浏览器绘制或 Windows 本机验收；DOM 测试不等同于浏览器解码测试。

复现命令（使用测试依赖环境）：

```bash
python -m pytest tests/test_media_read_v112.py tests/test_media_regression.py tests/test_media_management_step2.py tests/test_public_content_v50.py -q
node --experimental-vm-modules --test tests/media-dom.test.cjs
```

Node 测试使用 `tests/package.json` 的 jsdom 开发依赖；网站启动无需 Node、Pillow、PDF 测试工具或 FFmpeg。

## 更新与范围

本版不修改业务数据库表、索引、依赖锁文件及部署脚本。替换源码后重启网站；无须数据库初始化/迁移，也无须重新上传有效媒体。Windows 的项目根目录、数据库与媒体路径继续由现有配置控制，不能覆盖自己的运行数据。

目录核对表格的完整多选/筛选组件复用，以及未收录文件直接预览，是前述界面规划的后续内容，尚未在本次读取简化中实现。无法解码的损坏文件、浏览器不支持的编码、真实磁盘权限或断网，仍需要按明确提示处理；不能保证所有文件在所有浏览器都可预览。
