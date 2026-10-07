# 第三步：时间与时区（v0.15.117）

## 后台

可编辑时间戳字段使用共用 datetime-local 组件和可输入的 IANA 时区选择器，默认 Asia/Shanghai（北京时间）。建议列表包括 UTC、东京、新加坡、伦敦、纽约、洛杉矶，也可输入浏览器和服务器均支持的其他标准时区名称。组件显示所填日期对应的实际 UTC/GMT 偏移。

当前浏览器通过 localStorage 记住录入时区；禁用本地存储时组件仍可使用。换浏览器默认为北京时间。记录只存 UTC 时刻，不保存录入时区。已填写的时间切换时区会转换显示并保持实际时刻；想改变发布时间应编辑日期或时间值。

初次回填包含毫秒，切换时区和再保存保留毫秒。夏令时跳过的当地时间提示无效；出现两次的当地时间明确选择较早或较晚的一次。现有记录即使对应较晚一次，也能准确回填。无 JavaScript 时默认北京时间，仍可手动选择时区和重复时间选项；自动换算与记忆需要 JavaScript。

服务端只转换带 _timezone_<字段名> 的编辑表单值，已有 API/导入的 UTC 格式不变。原始并发版本 _stamp、账户有效期等内部时间不做显示层回写，纯日期和年份不换算。

## 前台

共用 time.html 输出原始 UTC datetime 属性和北京时间文本兜底。public-time.js 使用浏览器 Intl 转成本地时区，显示 GMT 偏移，悬停可查看时区名称。中英文使用相应格式但不改变实际时刻。首屏和 public:appended 滚动加载事件使用同一函数；不增加接口请求、地理定位或定时轮询。服务器的发布时间判断仍是 UTC，不受访客时钟影响。

## 部署

数据库 SQL 和表结构未变，无需数据库更新。本次添加 tzdata==2026.4 到主项目和运行依赖锁文件，为没有系统 IANA 数据的 Windows 提供后备数据；Worker 候选依赖清单同步列出。Linux 使用系统时区数据库，缺失时使用 Python tzdata。浏览器规则来自浏览器自身。

Windows 使用原启动脚本会检测锁文件摘要并同步依赖。生产更新必须包含依赖同步后重启；自定义启动环境可使用其 Python 执行 `-m pip install -r deploy/shared/requirements/requirements-vps.lock`。仅覆盖源码而不更新依赖，可能导致缺少时区数据。

## 主要修改

backend/app/native/time_fields.py、editor.py、field_help.py、web.py；frontend/admin/templates/native-fields.html、native-edit.html；frontend/admin/static/js/native-time.js、css/native-time.css；frontend/public/templates/time.html、content-fields.html、content-entry.html、layout.html；frontend/shared/static/js/public-time.js；依赖清单、测试和教程。

下一步为后台排序列快速编辑：继续复用行操作接口和 Content.save，不增加数据库字段。本版尚未实现排序快速编辑。
