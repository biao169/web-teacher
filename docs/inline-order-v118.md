# 第四步：后台排序列快速编辑（v0.15.118）

## 用法

适用模块已有的 sort_order / display_order 列现在支持行内数字输入。Enter 或 ✓ 保存，Esc 恢复；失焦不保存，数字未变化不发请求。仅接受数据库允许范围内的整数（保留负数支持），不自动重编号、不改变其他字段。无编辑权限或当前导航固定该字段时保持只读。

默认推荐列包含排序列，已有浏览器列偏好不强制覆盖，可通过列设置勾选或重置。

保存走原 /api/admin/<table>/<uid> 的 order 操作，服务器只允许原生可编辑的排序字段，调用 Content.save 处理权限、固定筛选、并发版本和事务。返回最新数值及 updated_at，不回传完整私密记录。普通用户和只读角色不能绕过界面直接保存。

局部刷新复用原模板及控制器，保留查询、列偏好、滚动位置、仍可见的勾选和排序草稿。未提交草稿只存在当前页面内存，不跨整页导航或浏览器重载持久化；退出前请完成保存。保留草稿时携带其原始版本，防止覆盖其他人修改。保存导致记录移出当前页或筛选范围时给出提示。保存失败保留输入；保存成功但刷新失败只提示重新读取，不自动重复写入。导航栏排序在完整刷新页面后同步。

## 文件

backend/app/native/ordering.py、list_columns.py、web.py；frontend/admin/templates/native-order-cell.html、native-list-panel.html、layout.html；frontend/admin/static/js/native-list.js、native.js；frontend/admin/static/css/native-order.css；相应回归测试及版本教程。

SQL 和依赖锁文件不变，无需数据库升级。第五步将联调新闻封面、私密留言、时区和排序编辑，并完成整体交付验收。
