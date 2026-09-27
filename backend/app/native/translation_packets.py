"""Bounded provider arrays and strict single-text envelopes; request identities never enter logs."""
import html,json,re,secrets
from .translation_service import request_for,extract,TranslationFailure,MAX_RESULT

# Deliberately below the official maxima, keeping CPU, response size and latency bounded.
LIMITS={'google':(32,5000,16000),'deepl':(32,5000,16000),'microsoft':(32,5000,16000),
        'libretranslate':(8,4000,12000),'mymemory':(8,500,500)}


def envelope(texts,nonce):
    """Number every boundary, including the end; reject source collisions before sending."""
    prefix='[['+nonce+':'
    if any(prefix in text for text in texts):raise TranslationFailure('invalid_response')
    return ''.join(prefix+str(i)+']]'+text for i,text in enumerate(texts))+prefix+str(len(texts))+']]'


def fits(provider,texts,source,target,config):
    """Bound item count, characters, UTF-8 text and encoded request body (including framing)."""
    count,chars,byte_limit=LIMITS[provider]
    if len(texts)>count:return False
    text=envelope(texts,'0'*12) if provider=='mymemory' and len(texts)>1 else ''.join(texts)
    if len(text)>chars or len(text.encode())>byte_limit:return False
    request=build(provider,texts,source,target,config,nonce='0'*12)
    return len(request.get('body') or b'')<=90000 and len(request['url'])<=8000


def pack(provider,entries,source,target,config):
    """Greedily pack indexed pieces; each packet preserves the input order and its exact mapping."""
    current=[]
    for entry in entries:
        if current and not fits(provider,[v for _,v in current]+[entry[1]],source,target,config):
            yield current;current=[]
        if not fits(provider,[entry[1]],source,target,config):raise TranslationFailure('too_large')
        current.append(entry)
    if current:yield current


def build(provider,texts,source,target,config,nonce=None):
    """Use official native arrays; MyMemory alone receives an independently verifiable envelope."""
    nonce=nonce or secrets.token_hex(6)
    text=envelope(texts,nonce) if provider=='mymemory' and len(texts)>1 else texts[0]
    request=request_for(provider,text,source,target,config)
    if provider!='mymemory' and len(texts)>1:
        body=json.loads(request['body'])
        if provider in ('google','libretranslate'):body['q']=texts
        elif provider=='deepl':body['text']=texts
        else:body=[{'Text':value} for value in texts]
        request['body']=json.dumps(body,ensure_ascii=False,separators=(',',':')).encode()
    # Local metadata only; HTTP adapters send their allowlisted fields, never these map values.
    request['packet']={'count':len(texts),'nonce':nonce if provider=='mymemory' and len(texts)>1 else ''}
    return request


def unpack(provider,status,payload,request,target):
    """Validate full array cardinality or every ordered boundary before returning any translation."""
    count=request['packet']['count']
    if status!=200:
        if status==400 and count>1:raise TranslationFailure('invalid_response')
        extract(provider,status,payload)
    try:
        if provider=='mymemory':
            text=extract(provider,status,payload);nonce=request['packet']['nonce']
            if count==1:return [text]
            markers=list(re.finditer(r'\[\['+re.escape(nonce)+r':(\d+)\]\]',text))
            if [m[1] for m in markers]!=[str(i) for i in range(count+1)] or text[:markers[0].start()].strip() or text[markers[-1].end():].strip():raise TranslationFailure('invalid_response')
            values=[text[a.end():b.start()] for a,b in zip(markers,markers[1:])]
            if any('[['+nonce in value for value in values):raise TranslationFailure('invalid_response')
        elif provider=='google':values=[x['translatedText'] for x in payload['data']['translations']]
        elif provider=='deepl':values=[x['text'] for x in payload['translations']]
        elif provider=='microsoft':
            if not isinstance(payload,list) or any(not isinstance(x['translations'],list) or len(x['translations'])!=1 or x['translations'][0].get('to',target).lower()!=target.lower() for x in payload):raise TranslationFailure('invalid_response')
            values=[x['translations'][0]['text'] for x in payload]
        else:
            values=payload['translatedText']
            if count==1 and isinstance(values,str):values=[values]
        if not isinstance(values,list) or len(values)!=count or any(not isinstance(v,str) or not v.strip() or len(v)>MAX_RESULT or '\x00' in v for v in values):raise TranslationFailure('invalid_response')
        if sum(len(v) for v in values)>MAX_RESULT:raise TranslationFailure('too_large')
        return [html.unescape(v) if provider=='google' else v for v in values]
    except (KeyError,IndexError,TypeError,AttributeError):raise TranslationFailure('invalid_response') from None
