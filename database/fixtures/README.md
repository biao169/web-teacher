# 合成演示数据 v1

不要将演示数据灌入正式目录。种子入口 `backend.app.services.demo.seed_demo`，无运行时额外依赖。

Windows双击项目根目录 `start-demo.cmd`；脚本复用 start.cmd 和 bootstrap.py，创建/复用用户目录下 `.local/share/teacher-site-demo-v1`，再启动同一应用。正式 start.cmd 的数据目录独立。已有未标记目录会拒绝执行，请改用一个新的空目录。

只生成、不启动（使用已装依赖的Python）：

```bash
python -m backend.cli seed-demo --directory /absolute/new/teacher-demo
```

Linux启动演示：`bash deploy/vps/start.sh --demo`。
Windows脚本未在Windows真机运行；Python种子和Linux HTTP启动已验证。

八类核心内容各10条，总计80条；关联样本包括：分类10、标签10、经历10、学术链接10、作者20、关键词10、项目成员10、研究关联10、新闻关联10、内容标签10、留言10、导航10。所有名称显式标记演示，邮箱/链接使用 example.invalid。

每类编号01—05为已发布公开，06隐藏，07草稿，08未来发布（2100年），09需登录，10禁用。因此当前每类公开接口应看到5条，而不是10条。02缺少英文题名以验证回退；05长标题。项目01金额NULL、02金额0；人物首个链接数值0；作者每篇2位，第二位标通讯作者。

不添加用户/默认密码/真实媒体对象/虚假任务。媒体权限用失败引用测试验收，不能把不存在的文件作为成功附件。非法关系只在测试事务里构造并回滚，不把坏外键留进演示数据库。

重复运行按稳定UID补缺失，保留用户改过的内容，关联使用 UID 冲突时 DO NOTHING。不是全量重置工具，不删除其他记录。每条内容事务独立，途中失败可重新执行；唯一约束或关联被人工破坏时会明确报错。

访问 `/api/v1/public/content/publications` 可验收演示数据；首页仍是第1步布局，完整内容页面在第7步实现。演示导航只是数据库样本，本阶段尚不驱动首页。
