"""Short-lived signed CMS-to-transfer identity tickets; one-time nonce consumption is in transfer DB."""
import base64,hashlib,hmac,json,secrets,time
from .catalog import Error

def sign(secret,claims):
    """HMAC is only a bridge envelope, never a replacement for password hashing."""
    if not secret or len(secret)<32:raise Error('尚未配置快传身份密钥',503)
    encoded=base64.urlsafe_b64encode(json.dumps(claims,separators=(',',':')).encode()).decode().rstrip('=')
    return encoded+'.'+hmac.new(secret.encode(),encoded.encode(),hashlib.sha256).hexdigest()
def verify(secret,token,audience):
    """Verify signature, audience, expiry and maximum lease duration before trusting identity."""
    try:
        if len(token)>8192:raise ValueError()
        encoded,signature=token.split('.')
        if not secret or len(secret)<32 or not hmac.compare_digest(signature,hmac.new(secret.encode(),encoded.encode(),hashlib.sha256).hexdigest()):raise ValueError()
        value=json.loads(base64.urlsafe_b64decode(encoded+'='*(-len(encoded)%4)))
        if value['aud']!=audience or not time.time()<value['exp']<=time.time()+301 or not isinstance(value['uid'],str):raise ValueError()
        return value
    except (ValueError,KeyError,TypeError):raise Error('快传登录凭据已失效，请重新进入',401) from None
