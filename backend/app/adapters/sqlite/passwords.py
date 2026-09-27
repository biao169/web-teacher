"""CPython/OpenSSL KDF; one bounded hashing operation at a time per process."""
import asyncio
import hashlib

class LocalKDF:
    def __init__(self): """保存构造参数和适配器，供此对象后续操作复用。""";self.busy=False
    async def __call__(self,password,salt,iterations):
        """串行执行本地密码派生，防止高并发占用过多资源。"""
        from backend.app.native.catalog import Error
        if self.busy: raise Error('登录繁忙，请稍后重试',429)
        self.busy=True
        task=asyncio.create_task(asyncio.to_thread(hashlib.pbkdf2_hmac,'sha256',password,salt,iterations,32))
        # Cancellation must not release the single-operation slot while the thread still runs.
        task.add_done_callback(lambda _:setattr(self,'busy',False))
        return await asyncio.shield(task)
