"""One safe HTML policy; DOM postprocessing only narrows trusted sanitizer output."""
import re
from html import escape
from justhtml import JustHTML, SanitizationPolicy, UrlPolicy, UrlRule
import mistune
from backend.app.native.catalog import Error as ContentError
BODY_FIELDS=('body_zh','body_en')
MEDIA=re.compile(r'/media/([a-f0-9]{32})\Z')
CLASSES={'ql-align-center','ql-align-right','ql-align-justify','image-left','image-right','image-center','image-wide','image-align-left','image-align-right'}
POLICY=SanitizationPolicy(
 allowed_tags={'p','br','h2','h3','h4','strong','b','em','i','u','s','del','ol','ul','li','blockquote','pre','code','hr','a','img'},
 allowed_attributes={'*':{'class'},'a':{'href','title'},'img':{'src','alt','title','width','height','data-image-width','data-image-height','data-image-min-width','data-image-min-height'}},
 url_policy=UrlPolicy(allow_rules={('a','href'):UrlRule(allowed_schemes={'https','http','mailto'},allow_relative=True,allow_fragment=False,resolve_protocol_relative=None),('img','src'):UrlRule(allowed_schemes=set(),allow_relative=True,allow_fragment=False,resolve_protocol_relative=None)}))
MARKDOWN=mistune.create_markdown(escape=True,plugins=['strikethrough'])

def render_body(value,format='plain'):
 """三种原生正文格式共用安全输出；Markdown原始HTML只作为文字，源码不改写。"""
 if not isinstance(value,str) or len(value)>200000:raise ContentError('正文最多200000字符')
 if format not in ('plain','markdown','html'):raise ContentError('请选择纯文本、Markdown或富文本')
 html=MARKDOWN(value) if format=='markdown' else plain_to_html(value) if format=='plain' else value
 return clean(html)

def body_references(value,format='html'):
 """以实际呈现格式提取媒体引用；纯文本、代码示例和转义HTML不会获得公开授权。"""
 return render_body(value,format)[1]

def convert_body(value,source,target):
 """显式转换编辑格式；返回受控HTML或文本，调用方须提示排版可能损失。"""
 html,_=render_body(value,source)
 if target=='html':return html
 doc=JustHTML(html,fragment=True,policy=POLICY)
 if target=='plain':return doc.to_text()
 if target=='markdown':return doc.to_markdown()
 raise ContentError('目标正文格式无效')
def media_references(value):
 """以正文相同安全策略提取精确媒体UID；纯文字地址和相似前缀不构成引用。"""
 if not isinstance(value,str) or len(value)>200000:raise ContentError('正文最多200000字符')
 doc=JustHTML(value,fragment=True,policy=POLICY);refs={}
 for node in doc.query('img, a'):
  match=MEDIA.fullmatch(node.attrs.get('src' if node.name=='img' else 'href',''))
  if match:refs[match[1]]='image' if node.name=='img' else refs.get(match[1],'link')
 return refs

def image_geometry(node):
 """Accept numeric dimensions only, then generate safe CSS; never preserve input styles."""
 styles=[]
 for key,css in [('data-image-width','width'),('data-image-height','height'),('data-image-min-width','min-width'),('data-image-min-height','min-height')]:
  value=node.attrs.get(key,'')
  if not value and css in ('width','height') and re.fullmatch(r'[1-9][0-9]{0,3}',node.attrs.get(css,'')):value=node.attrs[css]+'px'
  match=re.fullmatch(r'([1-9][0-9]{0,3})(px|%)',value)
  valid=bool(match and (int(match[1])<=4096 if match[2]=='px' else css=='width' and int(match[1])<=100))
  if valid:
   node.attrs[key]=value;styles.append(css+':'+('min(100%, '+value+')' if css=='min-width' else value))
  else:node.attrs.pop(key,None)
 node.attrs.pop('width',None);node.attrs.pop('height',None)
 if styles:node.attrs['style']=';'.join(styles)

def clean(value,allowed_media=None):
 """清理HTML中的危险标签、属性和链接，仅保留受支持的富文本。"""
 if not isinstance(value,str) or len(value)>200000:raise ContentError('正文最多200000字符')
 doc=JustHTML(value,fragment=True,policy=POLICY)
 refs={}
 for node in doc.query('*'):
  if node.name=='img':image_geometry(node)
  if 'class' in node.attrs:
   names=[x for x in node.attrs['class'].split() if x in CLASSES]
   if names:node.attrs['class']=' '.join(sorted(set(names)))
   else:node.attrs.pop('class',None)
  attr='src' if node.name=='img' else 'href' if node.name=='a' else None
  if not attr:continue
  url=node.attrs.get(attr,'');match=MEDIA.fullmatch(url)
  if match:
   uid=match[1]
   if allowed_media is not None and url not in allowed_media:
    if node.parent:node.parent.remove_child(node)
    continue
   refs[uid]='image' if node.name=='img' else refs.get(uid,'link')
  elif node.name=='img':
   if node.parent:node.parent.remove_child(node)
  elif not url.startswith(('https://','http://','mailto:')):node.attrs.pop('href',None)
 if len(refs)>10:raise ContentError('每种语言正文最多引用10个不同文件')
 html=doc.to_html(pretty=False)
 if len(html)>200000:raise ContentError('清理后的正文超过200000字符')
 return html,refs

def normalize_bodies(patch,current=None):
 """规范文本与HTML正文的格式及长度限制。"""
 current=current or {};merged=current|patch
 fmt=merged.get('body_format','text')
 if fmt not in ('text','html'):raise ContentError('正文格式仅支持text或html',{'body_format':'请选择纯文本或富文本'})
 if 'body_format' in patch and current and fmt!=current.get('body_format','text') and not all(f in patch for f in BODY_FIELDS):
  raise ContentError('转换格式必须同时提交两种语言正文；纯文本会转义，转回文本将丢失格式',{'body_format':'请在编辑页使用格式转换'})
 if fmt=='html':
  for field in BODY_FIELDS:
   if field in patch:patch[field]=clean(patch[field] or '')[0]
 return patch

def plain_to_html(value):"""转义纯文本并保留换行，生成可安全显示的HTML。""";return '<p>'+escape(value).replace('\n','<br>')+'</p>' if value else ''
def html_to_plain(value):"""提取富文本的可读纯文本，供搜索和摘要使用。""";return JustHTML(clean(value)[0],fragment=True,policy=POLICY).to_text()
