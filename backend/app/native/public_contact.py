"""Presentation helpers only; public_actions retains validation, throttle and save."""
MESSAGES={
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
    return {key:value for key in ('name','email','subject','content') if isinstance(value:=data.get(key),str)}
