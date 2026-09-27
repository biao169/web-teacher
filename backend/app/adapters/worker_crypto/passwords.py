"""Workers Web Crypto adapter; real Pyodide/runtime verification remains required."""
async def derive(password,salt,iterations):
    """使用Web Crypto按指定盐和迭代次数执行PBKDF2。"""
    from js import crypto, Uint8Array, Object
    from pyodide.ffi import to_js
    def obj(value):"""将Python字典转换为Web Crypto所需的JavaScript对象。""";return to_js(value,dict_converter=Object.fromEntries)
    key=await crypto.subtle.importKey('raw',Uint8Array.new(to_js(list(password))),obj({'name':'PBKDF2'}),False,to_js(['deriveBits']))
    params=obj({'name':'PBKDF2','salt':Uint8Array.new(to_js(list(salt))),'iterations':iterations,'hash':'SHA-256'})
    result=await crypto.subtle.deriveBits(params,key,256)
    return bytes(Uint8Array.new(result).to_py())
