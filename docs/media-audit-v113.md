# 磁盘核对列表与预览（v0.15.113）

## 完成内容

`/admin/media/audit` 使用媒体库的列表样式和共享组件。列顺序为：勾选、左侧预览、文件名、完整路径、核对结果、文件类型、大小/KB、操作。

图片使用原有缩略图组件，保持完整显示、懒加载与失败反馈。视频、PDF 显示小型类型入口，点击后按需弹窗预览；图片同样可以弹窗放大。弹窗提供关闭、原文件及下载操作，根据实际响应类型选择组件，不信任 URL 后缀。类型未知时提供下载，不强制嵌入。关闭视频弹窗会停止播放器并解除资源引用。

未收录文件的预览地址使用服务端报告编号和条目编号，不接收任意磁盘路径。每次核验媒体权限、报告所有者、有效期和存储范围，然后复用 v0.15.112 的文件读取函数。不会为预览创建数据库登记；之后显式收录完成时，原预览地址仍可转入已登记媒体的授权读取流程。报告过期、被清除、文件缺失或链接越界时返回明确失败。

表格支持：

- 本页单选、多选、全选、半选状态、已选数量和清空选择。换页/筛选后不保留隐藏条目的勾选，批量动作只针对当前页面明确勾选的条目。
- 逐项复核所选；复制已选完整路径；有创建权限时预检收录勾选的未登记项。每批收录最多 10 项，实际变更仍须确认。
- 搜索原文件名、登记标题及路径；列筛选与独立的升降序箭头。核对结果、文件类型多选同字段 OR，不同字段及关键词 AND。
- 整个已扫描报告先筛选和排序，再按 10/20/50/100 条分页；不把当前页筛选冒充报告级筛选。页码省略与跳转复用现有分页方法。
- 列宽拖动、列显隐、恢复推荐列；配置使用独立 `media_audit` 名称，不覆盖 `media_assets` 偏好。左侧预览列固定显示。
- 绝对路径仅在配置的本地媒体目录内生成；外链/R2 不伪造本地路径。长路径可展开并复制，大小按现有媒体库方式向上取整显示整数 KB。

## 复用与文件

| 文件 | 内容 |
| --- | --- |
| `backend/app/native/media_audit_list.py` | 扫描报告列表适配、参数验证、完整报告过滤排序、分页与有限查询缓存 |
| `backend/app/native/media_audit.py` | 新扫描记录必要显示元信息并构建合并索引；现有报告调用共用列表适配 |
| `backend/app/native/media_admin.py` | 列表上下文、保留条件的分页链接、未收录媒体预览入口 |
| `backend/app/native/media_response.py` | 抽出已授权条目共用的 `media_file_response`，普通媒体读取继续复用 |
| `frontend/admin/templates/native-table-parts.html` | 从既有列表抽取表头及列设置宏，普通列表与核对列表共同使用 |
| `frontend/admin/templates/native-list-panel.html` | 使用共享宏，原业务操作保持原入口 |
| `frontend/admin/templates/native-media-parts.html` | 共用缩略图宏，保留原媒体库的详情跳转 |
| `frontend/admin/templates/native-media-audit.html` | 接入共享表格、预览、多选、查询及分页组件 |
| `frontend/admin/static/js/native-table-selection.js` | 普通列表和核对列表共用选择控制器 |
| `frontend/admin/static/js/native-table-headers.js` | 保留已有行为，支持声明为多选的筛选字段 |
| `frontend/admin/static/js/native-list.js` | 复用选择控制器，正常列表的 CRUD 不交给核对页面 |
| `frontend/admin/static/js/native-columns.js` | 核对列表沿用紧凑大小列宽及列偏好控制 |
| `frontend/admin/static/js/native-media-audit.js` | 核对页自身的操作适配、批量复核和复制，不调用普通记录删除接口 |
| `frontend/admin/static/js/native-media.js` | 受控核对预览地址、按需媒体弹窗及清理 |
| `frontend/admin/static/css/native-media-preview.css` | 预览弹窗与核对小窗口样式 |
| `frontend/admin/static/js/native.js`、`native-media-fields.js`、`native-media-links.js`、`native-media-picker.js`、`native-sessions.js`、`frontend/admin/templates/layout.html` | 统一模块版本；核对列表只挂载对应适配器，避免双重事件处理 |
| `tests/test_media_audit_v113.py`、`tests/media-audit-dom.test.cjs` | 报告级查询、跨页编号、缓存、权限、未收录读取及真实模板交互回归 |
| `tests/test_list_regression.py`、`tests/list-dom.test.cjs` | 更新共享模块版本引用并验证既有列表 |
| `README.md`、`pyproject.toml`、`release-manifest.json` | 使用教程、版本与发布清单 |

## 资源与数据

继续使用现有扫描批次和最多 20000 条报告的上限。新报告每五个扫描批次保存一个合并元信息索引，不读取全部文件正文。第一次筛选读取报告索引并计算匹配条目；同一条件翻页复用结果位置，只读取需要展示的原报告页。每个报告只保留一个 `list-view.json` 槽，不因反复搜索积累查询文件。旧版无索引报告可从原缓存页读取，重新扫描后获得合并索引。

所有辅助文件位于已有报告缓存目录，清除报告时沿用原清理流程；不创建新的业务数据库或修改 SQL 初始化文件。报告内容仍是扫描时快照，行内“复核结果”不静默改写原分类统计或数据库。

## 验证结果

123 项 Python 测试与 44 项 DOM 测试通过，包含：

- 37 张图片跨多个扫描批次、额外 PDF/视频和缺失条目；筛选后全局排序、分页总数准确，报告原编号不变。
- 同一条件翻页命中查询缓存，反复改变条件仅使用一个缓存槽，旧报告继续可用。
- 未收录 JPG、PDF、MP4、WebM 的完整读取、HEAD 和 Range；不增加数据库记录。
- 未登录、错误报告所有者、过期报告、丢失文件及指向目录外的符号链接均不能取得媒体正文。
- 左侧预览、共享表头和列设置、多选数量/半选、批量复核、复制路径、多条件筛选、升降序、关闭预览清理，以及可选预览模块失败时的选择与筛选。
- 既有媒体库和其他业务列表、媒体读取、附件可见权限及删除预检保持正常。

```bash
python -m pytest tests/test_media_audit_v113.py tests/test_list_regression.py tests/test_media_read_v112.py tests/test_media_regression.py tests/test_media_management_step2.py tests/test_public_content_v50.py -q
node --experimental-vm-modules --test tests/list-dom.test.cjs tests/media-dom.test.cjs tests/media-audit-dom.test.cjs
```

DOM 测试使用 `tests/package.json` 的 jsdom 开发依赖；网站启动无需 Node。当前没有实际 Windows 浏览器和真实 R2 环境，本次不把模拟 DOM 验证等同于这些环境下的现场验收。

更新源码后重启网站即可，无须更新数据库或重新上传媒体。
