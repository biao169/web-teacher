"""Serial, bounded multi-document translation; completed documents are delivered immediately."""
import asyncio,time
from .catalog import Error
from .translation_config import PROVIDERS,availability,load_settings
from .translation_service import TranslationDocument,TranslationFailure,STATUS,MAX_REQUESTS,MAX_SOURCE_BYTES,language
from .translation_packets import pack,build,unpack


async def execute_many(r,items,provider='default',config=None,hooks=None,max_segments=256):
    """Pack equal-language/format text nodes, preserve successful documents, and split malformed packets."""
    if not isinstance(items,list) or not 1<=len(items)<=12:raise Error('一次最多处理12个独立原文')
    if any(not isinstance(x,dict) or not isinstance(x.get('text'),str) for x in items):raise Error('原文格式无效')
    if sum(len(x['text'].encode()) for x in items)>MAX_SOURCE_BYTES:raise Error('本次原文合计超过60000个UTF-8字节')
    for item in items:
        language(item.get('source','zh'));language(item.get('target','en'))
        if item.get('format','plain') not in ('plain','markdown','html'):raise Error('原文格式无效')
    config=config or await load_settings(r);hooks=hooks or {}
    if provider not in ('default','fallback',*PROVIDERS):raise Error('翻译服务选项无效')
    names=config['enabled'] if provider=='fallback' else [config['default'] if provider=='default' else provider]
    deadline=time.monotonic()+config['timeout'];calls=0;results={};attempts={i:[] for i in range(len(items))};stop=False

    async def deliver(index,result):
        """Only final whole-document results leave this executor; callbacks can commit before another HTTP."""
        if index in results:return
        result=result|{'attempts':list(attempts[index]),'requests':calls};results[index]=result
        if hooks.get('result'):await hooks['result'](index,result)

    for name in names:
        active=[i for i in range(len(items)) if i not in results]
        if not active or stop:break
        availability_state,message=availability(config,name,getattr(r,'translation_hosts',()))
        if availability_state!='ready':
            for i in active:attempts[i].append({'provider':name,'label':PROVIDERS[name],'status':availability_state,'message':message})
            continue
        docs={};values={};errors={};keys={};owners={};outputs={};groups={};started=set()
        for i in active:
            item=items[i]
            group=(language(item.get('source','zh')),language(item.get('target','en')),item.get('format','plain'))
            try:
                doc=TranslationDocument(item['text'],item.get('format')=='html',500 if name=='mymemory' else 4000,max_segments=max_segments)
                if len(list(pack(name,list(enumerate(doc.texts)),group[0],group[1],config)))>MAX_REQUESTS:raise TranslationFailure('too_large')
            except TranslationFailure as exc:errors[i]=exc.state;continue
            docs[i]=doc;values[i]=[]
            for value in doc.texts:
                key=(group,value)
                if key not in keys:
                    number=len(keys);keys[key]=number;groups.setdefault(group,[]).append((number,value))
                number=keys[key];values[i].append(number);owners.setdefault(number,set()).add(i)
        async def complete():
            """A partial document cannot overwrite its cache, even if some earlier packets succeeded."""
            for i,doc in docs.items():
                if i in results or i in errors or not all(k in outputs for k in values[i]):continue
                try:text=doc.render([outputs[k] for k in values[i]])
                except TranslationFailure as exc:errors[i]=exc.state;continue
                attempts[i].append({'provider':name,'label':PROVIDERS[name],'status':'success','message':STATUS['success']})
                await deliver(i,{'status':'success','text':text,'provider':name})
        await complete()
        for group,entries in groups.items():
            if stop:break
            source,target,_=group
            try:pending=list(pack(name,entries,source,target,config))
            except TranslationFailure as exc:
                for number,_ in entries:
                    for i in owners[number]:errors[i]=exc.state
                continue
            while pending and not stop:
                packet=pending.pop(0);indices=set().union(*(owners[number] for number,_ in packet))
                if hooks.get('eligible'):
                    for i in sorted(indices-set(results)-set(errors)):
                        if not await hooks['eligible'](i):errors[i]='skipped'
                packet=[entry for entry in packet if owners[entry[0]]-set(results)-set(errors)]
                if not packet:continue
                indices=sorted(set().union(*(owners[number] for number,_ in packet))-set(results)-set(errors))
                remaining=deadline-time.monotonic()
                if calls>=MAX_REQUESTS or remaining<=0:
                    for i in indices:errors[i]='interrupted' if i in started else 'paused'
                    stop=True;break
                request=build(name,[value for _,value in packet],source,target,config)
                if hooks.get('before') and not await hooks['before'](indices,name):
                    stop=True;break
                calls+=1;started.update(indices);uncertain=False;response_received=False
                try:
                    status,payload=await asyncio.wait_for(r.translation_transport.send(request,min(12,remaining)),min(12,remaining));response_received=True
                    translated=unpack(name,status,payload,request,target);failure=None
                except TranslationFailure as exc:failure=exc.state
                except (TimeoutError,asyncio.TimeoutError):failure='timeout';uncertain=True
                except Exception:failure='failed';uncertain=True
                if hooks.get('after'):await hooks['after'](indices,name,response_received,uncertain)
                if failure in ('invalid_response','too_large') and len(packet)>1:
                    middle=len(packet)//2;pending[0:0]=[packet[:middle],packet[middle:]]
                    continue
                if failure:
                    for i in indices:errors[i]=failure
                    if uncertain:
                        for i in indices:
                            attempts[i].append({'provider':name,'label':PROVIDERS[name],'status':failure,'message':STATUS[failure]+'；请求结果待确认，需明确重试。'})
                            await deliver(i,{'status':'failed','uncertain':True})
                    if failure in ('blocked','rate_limited','not_configured','disabled','blocked_endpoint'):
                        for i in active:
                            if i not in results:errors[i]=failure
                        pending=[]
                        break
                else:
                    outputs.update({entry[0]:text for entry,text in zip(packet,translated)})
                    await complete()
        for i in active:
            if i in results:continue
            state=errors.get(i,'interrupted' if i in started and stop else 'paused' if stop else 'invalid_response')
            if state in ('paused','skipped','interrupted'):
                await deliver(i,{'status':state});continue
            attempts[i].append({'provider':name,'label':PROVIDERS[name],'status':state,'message':STATUS[state]})
    for i in range(len(items)):
        if i not in results:
            if not attempts[i]:attempts[i].append({'provider':'','label':'翻译服务','status':'too_large','message':STATUS['too_large']})
            await deliver(i,{'status':'failed'})
    return {'results':[results[i] for i in range(len(items))],'requests':calls}
