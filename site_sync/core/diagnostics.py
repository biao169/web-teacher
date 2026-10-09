"""Bounded diagnostic vocabulary shared by admin and peer transports."""
import re
RELEASE='0.16.054'
CODES={
 'SYNC_PROPOSAL_PENDING':'对端已有未完成的推送任务；请先在对端查看并处理该任务',
 'SYNC_PROPOSAL_CHANGED':'此请求 ID 已用于其他域名或同步范围；请重新选择当前连接与内容后提交新请求',
 'SYNC_NATIVE_KEY_MISMATCH':'主站与原生辅助 Worker 的生效密钥不一致；核对数据库绑定并部署完整包',
 'SYNC_NATIVE_VERSION':'主站与原生辅助 Worker 版本不一致；请部署完整包',
 'SYNC_RESPONSE_SIGNATURE':'对端响应签名不匹配；检查密钥及中间代理',
 'PEER_REDIRECT':'对端返回重定向；检查最终域名、登录保护及路由，不会自动转发密钥签名',
 'PEER_ACCESS_CHALLENGE':'对端返回 Cloudflare 验证挑战；检查同步接口的访问规则',
 'SYNC_PROPOSAL_FAILED':'推送发送结果未确认；可使用同一请求 ID 重试，避免重复创建',

 'SYNC_NATIVE_PROTOCOL':'原生辅助正文协议不匹配；请部署完整包并确认辅助 Worker 已同步更新',
 'SYNC_CLEANUP_FAILED':'资源清理失败；保留原始异常并检查清理阶段日志',
 'SYNC_EXECUTOR_UNAVAILABLE':'独立同步执行器不可用；不会回退到主站执行',
 'SYNC_PAUSED':'本站或对端已暂停同步；保留断点，恢复后继续',
 'SYNC_KEY_MISSING':'对端未配置有效同步密钥',
 'SYNC_KEY_INVALID':'已保存的同步密钥格式或记录无效',
 'SYNC_SIGNATURE_INVALID':'请求签名不匹配；核对两端实际生效密钥',
 'SYNC_CLOCK_SKEW':'请求时间超出120秒窗口；检查两端时钟',
 'SYNC_ENVELOPE_INVALID':'请求签名字段缺失或格式错误',
 'SYNC_EXPORT_DISABLED':'对端连接或导出授权未启用、已过期',
 'SYNC_SCOPE_DENIED':'对端未授权所选范围；重新保存连接与当前授权',
 'SYNC_SCOPE_INVALID':'同步范围不合法，不能混用普通模块和分项恢复',
 'SYNC_REQUEST_INVALID':'同步请求格式或参数不合法',
 'SYNC_SOURCE_CONFLICT':'来源数据版本、媒体或断点发生冲突',
 'SYNC_SOURCE_FAILED':'对端导出处理异常；按追踪ID查看对端日志',
 'SYNC_RESOURCE_FAILED':'站点资源上下文初始化失败；查看运行日志',
 'SYNC_SCHEMA_MISSING':'数据库表或字段缺失；检查部署数据库初始化',
 'SYNC_STORAGE_FAILED':'数据库或媒体存储操作失败',
 'SYNC_LOCAL_CONNECTION':'本站连接或授权不可用',
 'SYNC_RPC_FAILED':'原生辅助RPC调用失败；尚不能确认是1101或1102',
 'SYNC_ADMIN_FAILED':'后台同步接口执行异常；查看诊断位置',
 'PEER_HTTP_FORBIDDEN':'对端返回401/403，未提供可识别原因；检查对端日志及安全规则',
 'PEER_HTTP_FAILED':'对端返回非成功HTTP状态',
 'INVOCATION_CONTEXT':'原生函数调用上下文错误；需更新原生辅助Worker',
 'NETWORK_REQUEST_FAILED':'请求未获得响应；检查网络、域名和路由',
 'STREAM_READ_FAILED':'响应流读取失败，保留断点重试',
 'NATIVE_TYPE_ERROR':'原生类型错误；结合执行阶段定位',
 'REQUEST_TIMEOUT':'请求超时，保留断点重试'}
def coded(exc,code):
    exc.code=code;return exc
def classify(exc,fallback):
    code=getattr(exc,'code',None)
    if code in CODES:return code
    message=str(exc)[:1024].lower()
    if any(x in message for x in ('no such table','no such column','has no column named')):return 'SYNC_SCHEMA_MISSING'
    return fallback
FIELDS={'request_id':r'[a-f0-9]{32}','peer_request_id':r'[a-f0-9]{32}','peer_component':r'(peer-site|peer-native)','peer_stage':r'[a-z_]{1,40}','peer_release':r'0\.[0-9]{1,3}\.[0-9]{1,4}','component':r'(local-native|local-runner|peer-site|peer-native|local-admin)','release':r'0\.[0-9]{1,3}\.[0-9]{1,4}'}
def fields(value):
    return {k:v for k,pattern in FIELDS.items() if isinstance(v:=getattr(value,k,None),str) and re.fullmatch(pattern,v)}
def peer_headers(headers):
    data={}
    for field in ('peer_request_id','peer_component','peer_stage','peer_release'):
        value=headers.get('x-sync-'+{'peer_request_id':'trace','peer_component':'component','peer_stage':'stage','peer_release':'release'}[field],'')
        if isinstance(value,str) and re.fullmatch(FIELDS[field],value):data[field]=value
    code=headers.get('x-sync-error','')
    if code in CODES:data['code']=code
    return data
