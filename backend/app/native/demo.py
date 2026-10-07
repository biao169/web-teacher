"""Explicit, idempotent native-schema examples; never called by server startup."""
import hashlib,json
from .catalog import CONTENT,TABLES,TITLE,now
async def seed(sql):
    """Insert about ten examples per content type; existing examples and user edits survive reruns."""
    created={};counts={};at=now()
    for table in (*CONTENT,'student_category_displays'):
        created[table]=0
        for i in range(1,11):
            uid='demo-'+table+'-'+str(i)
            if await sql.query(f'SELECT 1 FROM "{table}" WHERE uid=?',(uid,)):continue
            row={'uid':uid,TITLE[table]:('Example publication ' if table=='publications' else {'profiles':'示例教师','students':'示例学生','research_interests':'研究方向','projects':'科研项目','patents':'专利成果','courses':'示例课程','news':'新闻动态','student_category_displays':'学生分组'}[table])+str(i)}
            cols=TABLES[table]['columns']
            if 'visibility' in cols:row['visibility']='public'
            if 'is_active' in cols:row['is_active']=1
            if 'is_featured' in cols:row['is_featured']=int(i<=3)
            if 'sort_order' in cols:row['sort_order']=i
            if table=='profiles':row.update(title='副教授',organization='示例大学',bio='这里是教师简介，可在后台修改。',education='2010—2014 本科\n2014—2019 博士',experience='2019—2022 博士后\n2022 至今 任教')
            if table=='students':row.update(degree='博士' if i%2 else '硕士',category='在读',grade=str(2023+i%4),direction='计算机科学')
            if table=='projects':row.update(source='示例科研基金',status='在研',principal='示例教师',amount='10.5000',project_number='DEMO-'+str(i))
            if table=='publications':row.update(authors='Alice Smith; Bob Chen',venue='Example Journal',year=2026,publication_type='journal',doi=None)
            if table=='research_interests':row['description']='人工智能、数据分析与交叉学科应用。'
            if table=='news':row.update(slug='demo-news-'+str(i),content='这是一条可编辑的示例新闻。\n用于验证原生字段保存与前台展示。',content_format='plain',published_at=at)
            if table=='courses':row.update(semester='2026 春季',audience='本科生',summary='课程内容与教学目标。')
            if table=='patents':row.update(patent_type='发明专利',country='中国',inventors='示例教师',legal_status='授权')
            if table=='student_category_displays':row.update(key='group-'+str(i),keywords='博士' if i%2 else '硕士',enabled=1,display_order=i)
            await sql.batch([(f'INSERT INTO "{table}" ('+','.join('"'+k+'"' for k in row)+') VALUES ('+','.join('?' for _ in row)+')',tuple(row.values()))]);created[table]+=1
        counts[table]=(await sql.query(f'SELECT count(*) n FROM "{table}"'))[0]['n']
    digest=hashlib.sha256(json.dumps(sorted(counts)).encode()).hexdigest()
    await sql.batch([('INSERT INTO demo_seed_state(id,dataset_version,seeded_at,seed_digest) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET dataset_version=excluded.dataset_version,seeded_at=excluded.seeded_at,seed_digest=excluded.seed_digest WHERE demo_seed_state.dataset_version=\'native-1\'',('native-1',at,digest))])
    return {'created':created,'counts':counts}
