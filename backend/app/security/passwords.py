"""Password format v1; platform KDF implementations, never a home-made KDF."""
import base64
import hmac
import re
import secrets
from backend.app.native.catalog import Error as ContentError

# Shared by local Python and Workers Web Crypto; one portable password format.
ITERATIONS = 100_000

def validate_password(password):
    """检查密码长度和输入类型，避免无效密码进入派生过程。"""
    if not isinstance(password,str) or not 6 <= len(password) <= 128 or len(password.encode('utf-8')) > 512:
        raise ContentError('密码需要6—128个字符')

class Passwords:
    def __init__(self, derive): """保存构造参数和适配器，供此对象后续操作复用。""";self.derive=derive

    async def hash(self,password):
        """生成独立随机盐并派生带参数的密码摘要。"""
        validate_password(password)
        salt=secrets.token_hex(16)
        value=await self.derive(password.encode('utf-8'),salt.encode('ascii'),ITERATIONS)
        return f'pbkdf2_sha256${ITERATIONS}${salt}$'+base64.b64encode(value).decode('ascii')

    async def verify(self,password,encoded):
        # Bound stored parameters too: corrupt/unsupported encodings never choose KDF cost.
        """按统一参数验证密码；不接受其他迭代次数的哈希。"""
        valid=isinstance(password,str) and 1 <= len(password) <= 128 and len(password.encode('utf-8'))<=512
        try:
            algorithm,iterations,salt,expected=encoded.split('$')
            if algorithm!='pbkdf2_sha256' or iterations!=str(ITERATIONS) or not re.fullmatch('[a-f0-9]{32}',salt):raise ValueError()
            expected=base64.b64decode(expected,validate=True)
            if len(expected)!=32:raise ValueError()
            supported=True
        except (ValueError,AttributeError,TypeError):
            salt='0'*32;expected=b'\0'*32;supported=False
        computed=await self.derive((password if valid else 'invalid-input').encode('utf-8'),salt.encode('ascii'),ITERATIONS)
        return hmac.compare_digest(computed,expected) and supported and valid
