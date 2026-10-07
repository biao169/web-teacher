"""学生分类关键词与有界匹配查询；预览只读，不修改学生或分类记录。"""
import re
from .catalog import Error

MATCH_FIELDS = ('degree', 'category', 'grade', 'direction', 'status')
DISPLAY_FIELDS = ('name', *MATCH_FIELDS)
ASCII_LOWER = str.maketrans('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')

def parse_keywords(value):
    """拆分并去重关键词，限制查询规模；英文忽略大小写，中文按原文包含匹配。"""
    if value is None:value=''
    if not isinstance(value,str) or '\x00' in value:raise Error('匹配关键词必须是有效文本')
    if len(value)>4096:raise Error('匹配关键词总长度最多4096个字符')
    words={}
    for part in re.split(r'[\n,，;；]',value):
        part=part.strip()
        if not part:continue
        if len(part)>120:raise Error('每个匹配关键词最多120个字符')
        words.setdefault(part.translate(ASCII_LOWER),part)
        if len(words)>20:raise Error('每条分类最多设置20个不同的匹配关键词')
    return list(words.values())

def page_numbers(page,pages):
    """生成首末页和当前页附近的按钮，避免为大结果集创建无界数量的DOM节点。"""
    if pages<=11:return list(range(1,pages+1))
    visible=sorted({1,pages,*range(max(1,page-2),min(pages,page+2)+1)})
    result=[]
    for number in visible:
        if result and number-result[-1]>1:result.append(None)
        result.append(number)
    return result

async def match_page(content,principal,keywords,query=None):
    """在可见学生范围内计数并分页，仅返回当前页的名单字段；特殊字符按字面匹配。"""
    content.auth.require(principal,'students')
    words=parse_keywords(keywords);query=query or {}
    try:
        if isinstance(query.get('size'),bool) or isinstance(query.get('page'),bool):raise ValueError()
        size=int(str(query.get('size',10)));page=max(1,int(str(query.get('page',1))))
    except (ValueError,TypeError):raise Error('匹配结果页码或每页条数无效') from None
    if size not in (10,20,50,100):raise Error('每页支持10、20、50、100条')
    where,args=content.scope('students',principal);args=list(args)
    # One parameter per term stays within D1's binding budget; no arbitrary SQL identifiers.
    joined="lower("+" || ' ' || ".join(f"coalesce(\"{field}\",'')" for field in MATCH_FIELDS)+")"
    clauses=[]
    for word in words:
        clauses.append(joined+" LIKE ? ESCAPE '\\'")
        args.append('%'+word.translate(ASCII_LOWER).replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%')
    where+=' AND ('+' OR '.join(clauses)+')' if clauses else ' AND 0'
    total=(await content.sql.query('SELECT count(*) AS n FROM students WHERE '+where,args))[0]['n'] if words else 0
    pages=max(1,(total+size-1)//size);page=min(page,pages)
    # Preview cells are bounded independently of stored free text; private contact fields are omitted.
    projection='uid,'+','.join(f'substr("{field}",1,500) AS "{field}"' for field in DISPLAY_FIELDS)
    rows=await content.sql.query(f'SELECT {projection} FROM students WHERE {where} ORDER BY sort_order,id LIMIT ? OFFSET ?',(*args,size,(page-1)*size)) if total else []
    return {'rows':rows,'total':total,'page':page,'pages':pages,'size':size,'keywords':words,
            'page_numbers':page_numbers(page,pages),'can_edit':bool(principal['permissions']['students'].get('can_edit'))}
