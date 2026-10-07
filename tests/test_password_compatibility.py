"""Real CPython and Node Web Crypto; Pyodide transport is a test double, not cloud acceptance."""
import asyncio
import json
import shutil
import subprocess
import sys
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import patch
from backend.app.adapters.sqlite.passwords import LocalKDF
from backend.app.adapters.worker_crypto.passwords import derive
from backend.app.security.passwords import Passwords, ITERATIONS

SCRIPT = r'''
const {webcrypto} = require('node:crypto');
let input='';
process.stdin.on('data', s => input += s);
process.stdin.on('end', async () => {
  try {
    const v=JSON.parse(input);
    if(v.params.iterations !== 100000 || v.bits !== 256) throw Error('Unexpected KDF policy');
    const key=await webcrypto.subtle.importKey('raw',new Uint8Array(v.password),{name:'PBKDF2'},false,['deriveBits']);
    const result=await webcrypto.subtle.deriveBits({...v.params,salt:new Uint8Array(v.params.salt)},key,v.bits);
    process.stdout.write(JSON.stringify([...new Uint8Array(result)]));
  } catch(e) { process.stderr.write(e.name); process.exitCode=1; }
});
'''

class Array:
    def __init__(self, data): self.data=list(data)
    @classmethod
    def new(cls, data): return cls(data)
    def to_py(self): return self.data

class Subtle:
    async def importKey(self, kind, data, algorithm, extractable, usages):
        assert (kind, algorithm, extractable, usages) == ('raw', {'name':'PBKDF2'}, False, ['deriveBits'])
        return data.data
    async def deriveBits(self, params, key, bits):
        result=subprocess.run([shutil.which('node'), '-e', SCRIPT],
            input=json.dumps({'password':key,'params':{**params,'salt':params['salt'].data},'bits':bits}),
            text=True,capture_output=True,check=True,timeout=20)
        return json.loads(result.stdout)

@unittest.skipUnless(shutil.which('node'), 'Node required for actual Web Crypto comparison')
class CompatibilityTests(unittest.TestCase):
    def setUp(self):
        js=ModuleType('js');js.crypto=SimpleNamespace(subtle=Subtle());js.Uint8Array=Array
        js.Object=SimpleNamespace(fromEntries=object())
        pyodide=ModuleType('pyodide');ffi=ModuleType('pyodide.ffi')
        ffi.to_js=lambda value, **kwargs:value
        self.bridge=patch.dict(sys.modules,{'js':js,'pyodide':pyodide,'pyodide.ffi':ffi})
        self.bridge.start();self.addCleanup(self.bridge.stop)

    def test_identical_vectors(self):
        async def check():
            local=LocalKDF()
            for password in ('Ascii-password123','中文密码🙂123','e\u0301-password','密'*128):
                raw=password.encode('utf-8');salt=b'0123456789abcdef0123456789abcdef'
                self.assertEqual(await local(raw,salt,ITERATIONS),await derive(raw,salt,ITERATIONS))
        asyncio.run(check())

    def test_both_directions_and_wrong_password(self):
        async def check():
            local=Passwords(LocalKDF());worker=Passwords(derive)
            for password in ('Example-Password123', '中文密码🙂123'):
                a=await local.hash(password);b=await worker.hash(password)
                self.assertTrue(await worker.verify(password,a))
                self.assertTrue(await local.verify(password,b))
                self.assertFalse(await worker.verify('wrong-password',a))
                self.assertFalse(await local.verify('wrong-password',b))
                self.assertTrue(a.startswith('pbkdf2_sha256$100000$'))
                self.assertTrue(b.startswith('pbkdf2_sha256$100000$'))
        asyncio.run(check())

if __name__=='__main__': unittest.main()
