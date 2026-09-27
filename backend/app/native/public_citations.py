"""Bounded saved-citation reader; no generation, translation or writes."""
from .catalog import Error
FORMATS={name:'citation_'+name for name in ('gbt','elsevier','apa','ieee')}|{'bibtex':'bibtex'}
MAX_LENGTH=65536

async def saved_citations(content,style,uids,*,fixed_conditions=None):
    if style not in FORMATS:raise Error('不支持此引用格式')
    if not 1<=len(uids)<=20 or len(set(uids))!=len(uids) or any(not isinstance(uid,str) or not uid.strip() or len(uid)>128 for uid in uids):raise Error('每批需要1至20个不重复的条目编号')
    where,args=content.scope('publications',public=True,fixed_conditions=fixed_conditions)
    field=FORMATS[style]
    rows=await content.sql.query(f'SELECT uid,substr("{field}",1,65537) AS text FROM publications WHERE '+where+' AND uid IN ('+','.join('?' for _ in uids)+') LIMIT 20',[*args,*uids])
    found={row['uid']:row['text'] for row in rows}
    return {'format':style,'rows':[{'uid':uid,'text':found[uid] if isinstance(found[uid],str) and len(found[uid])<=MAX_LENGTH and found[uid].strip() else None} for uid in uids if uid in found]}
