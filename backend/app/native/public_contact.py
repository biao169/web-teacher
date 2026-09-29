"""Presentation helpers only; public_actions retains validation, throttle and save."""
MESSAGES={
 '新闻留言来源无效':'Invalid news message source.',
 '新闻不存在或不可见':'This news item is no longer available. Your text is retained.',
 '此新闻已关闭留言':'Messages are closed for this news item. Your text is retained.',
 '表单已过期，请刷新':'This form has expired. Your text is retained; please submit again.',
 '请填写留言，正文最多5000字':'Enter a message of up to 5,000 characters, a name up to 150 characters and a subject up to 300 characters.',
 '邮箱格式无效':'Enter a valid email address.',
 '请登录后留言':'Please sign in before sending a message.',
 '当前无法匿名留言':'Anonymous messages are currently disabled. Please sign in.',
 '提交过于频繁，请稍后重试':'Too many submissions. Please try again later.',
 '请求格式不正确':'The submission format is invalid. Please check your entries.',
 '请求内容过大':'The submission is too large. Please shorten your message.'}
def error_text(message,lang):
    if lang=='en':return MESSAGES.get(message,'Unable to send your message. Your text is retained.')
    return '表单已过期，内容已保留，请重新提交。' if message=='表单已过期，请刷新' else message

def form_values(data):
    return {key:value for key in ('name','email','subject','content','news_uid') if isinstance(value:=data.get(key),str)}

async def news_source(r,uid):
    """One source resolver for embedded forms and submissions; never widen public scope."""
    from .catalog import Error
    if not isinstance(uid,str) or not 1<=len(uid)<=128:raise Error('新闻留言来源无效',422)
    where,args=r.content.scope('news',public=True)
    rows=await r.sql.query('SELECT uid,title,allow_comments FROM news WHERE uid=? AND '+where,(uid,*args))
    if not rows:raise Error('新闻不存在或不可见',404)
    if rows[0]['allow_comments']!=1:raise Error('此新闻已关闭留言',403)
    return rows[0]

async def form_context(r,lang,values=None,news=None,strict=True):
    import secrets
    from urllib.parse import quote,urlencode
    from .catalog import Error
    values=dict(values or {});uid=values.get('news_uid','');source_ok=True
    if uid and news is None:
        try:news=await news_source(r,uid)
        except Error:
            if strict:raise
            source_ok=False
    if news:
        uid=news['uid'];values['news_uid']=uid
        values.setdefault('subject',news.get('title','')[:300])
    allowed=source_ok and (bool(r.p) or bool(await r.sql.query('SELECT 1 FROM global_settings WHERE allow_anonymous_messages=1 LIMIT 1')))
    return {'challenge':secrets.token_urlsafe(32),'contact_values':values,'contact_allowed':allowed,
            'contact_news':news,'contact_source_ok':source_ok,
            'contact_action':'/'+lang+'/contact'+('?' +urlencode({'news':uid}) if uid else ''),
            'contact_back':'/'+lang+'/news/'+quote(uid,safe='') if uid else '/'+lang,
            'contact_message':'','contact_success':False}
