"""Five providers share text segmentation, finite budgets and safe rich-text reconstruction."""
import asyncio,html,json,re,time
from html.parser import HTMLParser
from urllib.parse import urlencode
from .catalog import Error
from .translation_config import PROVIDERS,availability,load_settings

STATUS={'success':'✓ 翻译成功','disabled':'服务未启用','not_configured':'缺少必要配置','blocked':'认证失败或服务拒绝访问','rate_limited':'服务限流或额度不足，请稍后重试','timeout':'本次翻译等待超时','failed':'服务暂不可用','invalid_response':'服务返回了无效译文','too_large':'内容超过本次安全处理范围，请缩短文本或改用适用服务'}
MAX_REQUESTS=20
MAX_SOURCE_BYTES=60000
MAX_RESULT=200000
URL_TOKEN=re.compile(r'https?://[^\s<>"\']+|/media/[a-f0-9]{32}')

class TranslationFailure(Exception):
    """Only a fixed public state leaves a provider; never an upstream response or credential."""
    def __init__(self,state):
        """Store only the public failure code, without carrying an external exception body."""
        self.state=state

def language(value):
    """Validate the native language tag before placing it in fixed provider parameters."""
    if not isinstance(value,str) or not re.fullmatch('[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?',value):raise Error('源语言和目标语言须为明确的语言代码，例如zh、en')
    return value.lower()

def chunks(value,limit):
    """Split by UTF-8 bytes, preferring sentence/word boundaries without truncating any character."""
    while value:
        size=0;end=0;boundary=0
        for i,char in enumerate(value):
            size+=len(char.encode())
            if size>limit:break
            end=i+1
            if char.isspace() or char in '。！？；.!?;':boundary=end
        if end==len(value):yield value;return
        end=boundary or end
        if not end:raise TranslationFailure('too_large')
        yield value[:end];value=value[end:]

class TranslationDocument(HTMLParser):
    """Translate text nodes only; markup, media URLs, code and link addresses never go upstream."""
    def __init__(self,value,is_html,limit,max_segments=MAX_REQUESTS):
        super().__init__(convert_charrefs=True);self.parts=[];self.texts=[];self.indices={};self.is_html=is_html;self.limit=limit;self.skip=0
        if not isinstance(value,str) or not value.strip() or len(value.encode())>MAX_SOURCE_BYTES:raise TranslationFailure('too_large')
        if is_html:
            from backend.app.domain.richtext import clean
            self.feed(clean(value)[0]);self.close()
        else:self.handle_data(value)
        if len(self.texts)>max_segments:raise TranslationFailure('too_large')
    def handle_starttag(self,tag,attrs):
        """Retain sanitized markup; pre/code content remains literal."""
        self.parts.append(self.get_starttag_text());self.skip+=int(tag in ('pre','code'))
    def handle_startendtag(self,tag,attrs):
        """Retain sanitized void tags without changing the code nesting state."""
        self.parts.append(self.get_starttag_text())
    def handle_endtag(self,tag):
        """Close existing markup without allowing a provider to add or remove tags."""
        self.parts.append('</'+tag+'>');self.skip=max(0,self.skip-int(tag in ('pre','code')))
    def literal(self,value):
        """Escape text literals only when reconstructing HTML."""
        self.parts.append(html.escape(value,quote=False) if self.is_html else value)
    def handle_data(self,value):
        """Preserve URLs and whitespace, deduplicate identical segments within this one call."""
        if self.skip:self.literal(value);return
        offset=0
        for match in URL_TOKEN.finditer(value):
            self.segment(value[offset:match.start()]);self.literal(match[0]);offset=match.end()
        self.segment(value[offset:])
    def segment(self,value):
        """Keep paragraph whitespace outside translated payloads and enforce the segment byte limit."""
        if not value.strip():self.literal(value);return
        for line in re.split(r'(\r?\n)',value):
            if not line.strip():self.literal(line);continue
            self.chunked(line)
    def chunked(self,value):
        """Register finite byte-bounded pieces from a single paragraph line."""
        for part in chunks(value,self.limit):
            text=part.strip();leading=part[:len(part)-len(part.lstrip())];trailing=part[len(part.rstrip()):]
            self.literal(leading)
            if text:
                if text not in self.indices:self.indices[text]=len(self.texts);self.texts.append(text)
                self.parts.append(self.indices[text])
            self.literal(trailing)
    def render(self,translated):
        """Build all-or-nothing text, escaping provider markup and bounding the final document."""
        result=''.join((html.escape(translated[p],quote=False) if self.is_html else translated[p]) if isinstance(p,int) else p for p in self.parts)
        if len(result)>MAX_RESULT:raise TranslationFailure('too_large')
        return result

def request_for(provider,text,source,target,config):
    """Build the provider's official language/auth/body mapping without exposing credentials."""
    source=language(source);target=language(target);url=config['endpoints'][provider];headers={};body=None;method='POST'
    key=config['keys'].get(provider,'')
    if provider=='mymemory':
        params={'q':text,'langpair':source+'|'+target,'mt':'1'}
        if config['email']:params['de']=config['email']
        url+='?'+urlencode(params);method='GET'
    elif provider=='google':
        headers['X-Goog-Api-Key']=key;body={'q':text,'source':source,'target':target,'format':'text'}
    elif provider=='deepl':
        headers['Authorization']='DeepL-Auth-Key '+key
        body={'text':[text],'source_lang':source.split('-')[0].upper(),'target_lang':target.upper()}
    elif provider=='microsoft':
        if not url.endswith('/translate'):url+='/translate'
        url+='?'+urlencode({'api-version':'3.0','from':source,'to':target,'textType':'plain'})
        headers['Ocp-Apim-Subscription-Key']=key
        if config['region']:headers['Ocp-Apim-Subscription-Region']=config['region']
        body=[{'Text':text}]
    else:
        if not url.endswith('/translate'):url+='/translate'
        body={'q':text,'source':source.split('-')[0],'target':target.split('-')[0],'format':'text'}
        if key:body['api_key']=key
    if body is not None:body=json.dumps(body,ensure_ascii=False).encode();headers['Content-Type']='application/json'
    return {'provider':provider,'url':url,'method':method,'headers':headers,'body':body}

def extract(provider,status,payload):
    """Validate successful text and map auth/limit errors without returning vendor messages."""
    if status!=200:raise TranslationFailure({401:'blocked',403:'blocked',429:'rate_limited',456:'rate_limited',413:'too_large'}.get(status,'failed'))
    try:
        if provider=='mymemory':
            if payload.get('quotaFinished') is True or str(payload.get('responseStatus'))=='429':raise TranslationFailure('rate_limited')
            if str(payload.get('responseStatus'))!='200':raise TranslationFailure('invalid_response')
            text=payload['responseData']['translatedText']
        elif provider=='google':text=payload['data']['translations'][0]['translatedText']
        elif provider=='deepl':text=payload['translations'][0]['text']
        elif provider=='microsoft':text=payload[0]['translations'][0]['text']
        else:text=payload['translatedText']
        if not isinstance(text,str) or not text.strip() or len(text)>MAX_RESULT or '\x00' in text:raise TranslationFailure('invalid_response')
        return html.unescape(text) if provider in ('google','mymemory') else text
    except (KeyError,IndexError,TypeError,AttributeError):raise TranslationFailure('invalid_response') from None

class TranslationService:
    def __init__(self,r):
        """Reuse the current request's backend transport and effective configuration."""
        self.r=r
    async def execute_many(self,items,provider='default',config=None,hooks=None):
        """Translate bounded independent documents with native arrays and per-result checkpoint hooks."""
        from .translation_multi import execute_many
        return await execute_many(self.r,items,provider,config,hooks)
    async def execute(self,text,source='zh',target='en',provider='default',is_html=False,config=None):
        """Try one provider unless fallback was explicit; no partial result or automatic retries."""
        config=config or await load_settings(self.r);language(source);language(target)
        if provider not in ('default','fallback',*PROVIDERS):raise Error('翻译服务选项无效')
        names=config['enabled'] if provider=='fallback' else [config['default'] if provider=='default' else provider]
        deadline=time.monotonic()+config['timeout'];calls=0;attempts=[]
        for name in names:
            state,message=availability(config,name,getattr(self.r,'translation_hosts',()))
            result=None
            if state=='ready':
                try:
                    doc=TranslationDocument(text,is_html,500 if name=='mymemory' else 4000)
                    if calls+len(doc.texts)>MAX_REQUESTS:raise TranslationFailure('too_large')
                    outputs=[]
                    for part in doc.texts:
                        remaining=deadline-time.monotonic()
                        if remaining<=0:raise TranslationFailure('timeout')
                        calls+=1
                        status,payload=await asyncio.wait_for(self.r.translation_transport.send(request_for(name,part,source,target,config),min(12,remaining)),min(12,remaining))
                        outputs.append(extract(name,status,payload))
                    result=doc.render(outputs);state='success'
                except TranslationFailure as exc:state=exc.state
                except (TimeoutError,asyncio.TimeoutError):state='timeout'
                except Exception:state='failed'
                message=STATUS[state]
            attempts.append({'provider':name,'label':PROVIDERS[name],'status':state,'message':message})
            if state=='success':return {'status':'success','text':result,'provider':name,'attempts':attempts,'requests':calls}
            if time.monotonic()>=deadline:break
        return {'status':'failed','attempts':attempts,'requests':calls}
