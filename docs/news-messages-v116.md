# 第二步：新闻私密留言（v0.15.116）

## 使用

后台新闻编辑开启 allow_comments，保存后已发布公开新闻详情出现留言区。开启全局 allow_anonymous_messages 可接受游客留言，否则需要登录；登录复用现有弹窗。姓名、邮箱、主题遵循原有规则，正文最多5000字。留言固定以 hidden / new 保存，访客不能指定公开状态或来源类型。

联系页面与新闻详情共用 contact-fields.html 和 contact.js；POST 仍走 /<lang>/contact。无 JavaScript 时原生提交可用，错误页面保留内容和新闻来源；成功跳转至带来源的联系页面。有 JavaScript 时原地显示成功或错误。“再写一条”保留新闻来源。

来源写在现有 message_type=news:<UID>，由服务器查验公开且允许留言的新闻后生成，普通留言仍为 contact。subject 默认填新闻标题，可修改；content 仅存用户正文。后台列表的类型列和留言详情解析来源，批量读取可公开访问的新闻；删除或隐藏来源不删除留言，不泄露隐藏新闻标题。

提交复用原有来源/token检查、限流、字段规则和入库函数。SQL INSERT 条件同时检查新闻公开发布和留言开关、匿名策略，避免表单打开后关闭入口仍写入。没有新的留言表、外键、schema变更或依赖。

## 文件

backend/app/native/public_contact.py、public_actions.py、web.py、messages.py、message_log_admin.py、field_help.py；frontend/public/templates/contact-form.html、contact-fields.html、content-detail.html、layout.html；frontend/admin/templates/native-message-source.html、native-list-panel.html、native-record-detail.html；frontend/public/static/css/academic.css。增加新闻留言测试及共用表单的来源保留测试。

## 下一步

默认北京时间的后台日期时间与时区选择器，允许切换并记住当前浏览器偏好，统一 UTC 保存。前台按浏览器时区显示；不改数据库。不在本版实现排序快速编辑或公开评论线程。
