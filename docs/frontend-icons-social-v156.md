# v0.15.156：第二步完成说明

基于本轮v0.15.155完整包完成第二步，未执行第三步多域名改造。

## 图标

- `frontend/shared/static/favicon.svg`：用户上传SVG的原始字节。
- `frontend/shared/static/site-logo.png`：用户上传的256×256 PNG原图。
- `frontend/shared/static/apple-touch-icon.png`：同一PNG原图，无重新绘制或有损转换。
- `frontend/shared/templates/base.html`：无自定义图标时先提供PNG兼容图标，再提供SVG图标；增加 `apple-touch-icon`，sizes与原图一致为256×256。三个默认资源均使用v0.15.156版本参数。
- 已有后台自定义favicon仍优先，不会同时追加默认favicon与它竞争。Apple图标固定使用提供的有效默认PNG，不将自定义SVG当作Apple PNG。
- 首页、后台、登录和同步页面通过共用基础模板获得图标；本地静态资源和Worker打包资源均已验证。

本次替换网站默认图标，不改网站设置中已保存的页面Logo。SVG和PNG源文件逐字节与附件核对一致。

## 社交平台数值

v154/v155中已有的数值读取逻辑经核验无需重写：

| 链接字段 | 数值字段 |
| --- | --- |
| orcid | orcid_value |
| personal_homepage | personal_homepage_value |
| google_scholar | google_scholar_value |
| dblp | dblp_value |
| github | github_value |
| cnki | cnki_value |

`backend/app/native/public_data.py`已向公开页面提供以上字段，`frontend/public/templates/person-links.html`已读取对应值。中英文首页、教师列表和详情均验证：正值显示，0显示，未填写隐藏；仅有数值仍显示平台名和值；有效链接继续可点击，ORCID裸ID继续转换为正确链接。此步不新增字段或联网获取数字。

## 验证

新增 `tests/test_public_icons_social_v156.py`：六个平台/三种数值状态/两种语言/三类页面组合；本地与Worker打包模板的图标链接和实际资源；保留自定义favicon优先级及Apple PNG回退。

运行以下检查共16项通过：

```
python -B -m pytest -q tests/test_public_icons_social_v156.py tests/test_public_social_v154.py site_sync/tests/test_module_layout_v155.py
```

Worker打包中三个图标与源文件逐字节一致，同步独立模块的打包及界面加载检查通过。仅验证本地HTTP、模板和Worker打包资源；未验证真实iPhone/iPad添加到主屏幕、真实浏览器图标选择或线上部署。v155说明中的旧历史测试限制仍然适用，未宣称全历史套件通过。

## 使用与下一步

本完整包包含第一步与第二步，保留install-multi.sh、同步任务面板和此前低资源模式。无需修改或重新初始化数据库。通过既有部署流程更新完整源码并重新部署/重启；从v154直接更新时需采用干净源码目录，避免仅解压覆盖遗留旧同步文件，沿用原数据库、媒体、运行配置和任务缓存。

默认图标资源已更新版本参数；已添加到Apple主屏幕的旧快捷方式可能需要重新添加。后台自定义favicon仍会覆盖默认favicon，这是原有配置优先规则。

下一步是多域名访问：增加TEACHER_ALLOWED_ORIGINS，统一Host/Origin/CSRF校验，并衔接Worker绑定、Ubuntu/Debian反向代理及快传入口。
