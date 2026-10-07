"""Versioned synthetic scenario definitions; separate IDs keep older examples and user edits intact."""
import hashlib,json
from .catalog import CONTENT
VERSION='native-2'
TOPICS=['设备状态监测','轴承故障诊断','时序模式识别','预测性维护','可解释人工智能','边缘智能','制造质量分析','多传感器融合','数字孪生','智能运维']
NAMES=[('周林','Lin Zhou'),('陈明','Ming Chen'),('李薇','Wei Li'),('王宁','Ning Wang'),('赵敏','Min Zhao'),('刘洋','Yang Liu'),('黄静','Jing Huang'),('吴越','Yue Wu'),('徐晨','Chen Xu'),('林曦','Xi Lin')]
GROUPS=[('media_assets','媒体与附件',6),('profiles','教师与团队',10),('students','学生',10),('student_category_displays','学生分类',4),('research_interests','研究方向',10),('projects','科研项目',10),('publications','论文与引文',10),('patents','专利软著',10),('courses','课程与材料',10),('news','新闻与正文',10),('navigation_items','导航配置',4),('site_settings','未启用的网站设置',1),('auth_roles','角色权限',4),('auth_users','停用账号',3),('translation_cache','译文与多来源',8),('messages','演示留言',3)]

def identity(table,index):
    """Stable opaque IDs are scoped to the dataset, table and ordinal, never inferred from user text."""
    return hashlib.sha256(f'teacher-examples:{VERSION}:{table}:{index}'.encode()).hexdigest()[:32]

def permission_preset(index):
    """Useful non-system example roles; no existing account is attached or changed."""
    choices=[{'profiles':['view','create','edit'],'students':['view','create','edit'],'courses':['view','create','edit'],'media_assets':['view']},
             {t:['view'] for t in ('profiles','students','publications','projects','news','media_assets')},
             {'publications':['view','create','edit'],'translation_cache':['view','create','edit'],'profiles':['view'],'media_assets':['view','create']},
             {'media_assets':['view','create','edit'],'news':['view']}]
    return choices[index-1]

def translation_source(index):
    """Examples pair shared phrases, a manual disagreement, and its pending source."""
    return [('profiles',1,'bio'),('research_interests',1,'description'),('research_interests',2,'description'),('projects',1,'name'),('projects',2,'name'),('projects',3,'name'),('students',1,'direction'),('students',2,'direction')][index-1]

def initial_translation(index):
    """Human-authored illustrative text; never attribute these examples to a translation provider."""
    return {1:'Demo profile: research in condition monitoring and interpretable artificial intelligence.',2:'Equipment condition monitoring and predictive maintenance.',4:'Demonstration: intelligent maintenance study.',5:'Demonstration: research on smart maintenance.',7:'Time-series pattern recognition.'}.get(index)

def values(table,i,media=None):
    """Build editable native fields and real references; reserved fields remain outside the payload."""
    media=media or {};topic=TOPICS[(i-1)%10];cn,en=NAMES[(i-1)%10]
    key=lambda n:media[n]['object_key'];uid=lambda t,n:identity(t,n)
    row={}
    if table in CONTENT:
        row.update(visibility='hidden' if i==10 else 'public',sort_order=1000+i)
        if table!='research_interests':row['is_featured']=int(i<=2)
    if table=='profiles':
        row.update(name=cn,name_en=en,role='示例教师',title='副教授（示例）',organization='演示大学（虚构）',lab='智能运维演示实验室',is_active=1,avatar_key=key(1+(i%3)),bio='示例教师简介：研究设备状态监测与可解释人工智能。' if i==1 else '虚构教学示例。研究方向：'+topic+'。',education='2012—2016 机械工程本科（示例）\n2016—2021 机械工程博士（示例）',experience='2021—至今 教学科研岗位（示例）',recruiting='欢迎对信号分析与智能制造感兴趣的同学交流。',contact_visibility='hidden')
    elif table=='students':row.update(name='示例学生 '+cn,name_en=en,avatar_key=key(1+i%3),student_id=f'EXAMPLE-{i:03}',degree=['博士','硕士','本科'][i%3],category='毕业' if i>7 else '在读',grade=str(2023+i%4),direction='时序模式识别' if i<=2 else topic,status='毕业' if i>7 else '在读',destination='示例研究机构' if i>7 else None,awards='示例课程优秀展示',bio='虚构学生资料，用于分组、筛选与双语展示。',contact_visibility='hidden')
    elif table=='research_interests':row.update(name='示例方向：'+topic,description='设备状态监测与预测性维护。' if i<=2 else '示例研究问题：'+topic+'。结合信号处理与数据建模，并核对模型不确定性。')
    elif table=='projects':row.update(name='示例智能运维研究' if i<=3 else '示例项目：'+topic,source='演示科研基金',fund_name='教学演示专项（虚构）',project_number=f'EXAMPLE-P-{i:03}',project_role='负责人',principal='周林',members='周林；陈明；李薇',start_date='2026-01-01',end_date='2028-12-31',status='在研' if i<=7 else '结题',amount='0.0000' if i==9 else f'{10+i}.5000')
    elif table=='publications':
        from .example_citations import PAPERS
        row.update(PAPERS[i-1]);row.update(pdf_key=key(4),pdf_visibility='hidden' if i==10 else 'public',display_tags='示例论文；智能制造',keywords=topic+'；信号分析；虚构教学资料',index_type='示例',author_role='第一作者',corresponding_authors='Lin Zhou')
    elif table=='patents':row.update(name='示例专利：'+topic+'方法',country='中国',patent_type='软件著作权' if i%3==0 else '发明专利',application_number=f'EXAMPLE-APPLICATION-{i}',grant_number=f'EXAMPLE-GRANT-{i}' if i<=5 else None,application_date='2025-06-01',grant_date='2026-03-01' if i<=5 else None,inventors='周林；陈明',owner='演示大学（虚构）',legal_status='授权（示例）' if i<=5 else '申请中（示例）',summary='仅用于界面演示，不代表真实知识产权。',certificate_key=key(4))
    elif table=='courses':row.update(name='示例课程：'+topic,semester='2026 秋季',audience='研究生' if i%2 else '本科生',summary='教学演示：信号采集、特征分析、模型比较与结果复核。',references_text='本课程附件为原创演示PDF，不对应真实出版物。',syllabus_key=key(4),material_key=key(4),material_visibility='hidden' if i==10 else 'public')
    elif table=='news':
        fmt=['html','markdown','plain'][(i-1)%3];img=media[3]['uid'];pdf=media[4]['uid']
        body={'html':f'<h2>示例研究交流</h2><p>本新闻为虚构场景，用于演示正文与关联资料。</p><p><img src="/media/{img}" alt="演示插图"></p><p><a href="/media/{pdf}">查看演示PDF</a></p>', 'markdown':f'## 示例教学活动\n\n这是虚构活动内容。\n\n![演示插图](/media/{img})\n\n[演示PDF](/media/{pdf})','plain':'这是一条虚构示例新闻。\n用于测试纯文本展示与来源定位。'}[fmt]
        row.update(title='示例动态：'+topic,slug=f'native-examples-v2-news-{i}',category='教学活动' if i%2 else '科研交流',cover_key=key(3),content=body,content_format=fmt,related_publication_uid=uid('publications',1),related_project_uid=uid('projects',1),related_student_uid=uid('students',1),allow_comments=0,published_at='2099-01-01T00:00:00.000Z' if i==9 else '2026-01-01T00:00:00.000Z')
    elif table=='student_category_displays':row.update(key=f'native-examples-v2-category-{i}',label=['示例博士生','示例硕士生','示例本科生','示例毕业生'][i-1],label_en=['Demo doctoral students','Demo masters students','Demo undergraduates','Demo alumni'][i-1],keywords=['博士','硕士','本科','毕业'][i-1],enabled=0,display_order=1000+i)
    elif table=='navigation_items':row.update(title=['示例博士列表','示例论文列表','示例课程入口','示例新闻入口'][i-1],kind='link',url_name=f'native-examples-v2-nav-{i}',path=['/admin/students?f.degree=%E5%8D%9A%E5%A3%AB','/admin/publications?f.year=2026','/zh/courses','/zh/news'][i-1],location='admin-sidebar' if i<=2 else 'header',visibility='staff' if i<=2 else 'public',enabled=0,sort_order=1000+i)
    elif table=='site_settings':row.update(site_name='示例教学与科研网站（未启用）',site_name_en='Demonstration research website',is_active=0,hero_title='示例：智能制造与设备运维',hero_subtitle='示例配置，可打开编辑页参考填写',logo_key=key(1),og_image_key=key(3),seo_title='示例教师网站',seo_description='仅作配置演示，添加后不会成为生效配置。',footer_text='演示资料，不对应真实单位或科研成果。')
    elif table=='auth_roles':row.update(name=['示例：教学编辑','示例：内容只读','示例：论文编辑','示例：媒体整理'][i-1],description='演示角色；不会分配给现有账号。',level=10,visibility_scopes=['public','staff'],is_active=1,sort_order=1000+i)
    elif table=='auth_users':row.update(username=f'example_v2_user_{i}',display_name=['示例教学账号','示例只读账号','示例锁定账号'][i-1],role_uid=uid('auth_roles',i),status='locked' if i==3 else 'disabled',must_change_password=1,visibility='hidden')
    return row


def translation_original(index):
    """A preset translation must never be applied to a source the user has already rewritten."""
    return ['示例教师简介：研究设备状态监测与可解释人工智能。','设备状态监测与预测性维护。','设备状态监测与预测性维护。','示例智能运维研究','示例智能运维研究','示例智能运维研究','时序模式识别','时序模式识别'][index-1]
