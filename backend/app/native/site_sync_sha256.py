"""Serializable SHA-256 for bounded integrity steps, not authentication.

Only eight chaining words, byte count and <64 tail bytes are persisted. HMAC
continues using hashlib. The format is private and checked before every update.
"""
import struct

MASK=0xffffffff
INITIAL=(0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19)
K=(0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2)

def initial():return {'format':1,'words':list(INITIAL),'count':0,'tail':''}

def rotate(x,n):return ((x>>n)|(x<<(32-n)))&MASK

def checked(state):
    if not isinstance(state,dict) or state.get('format')!=1:raise ValueError('Invalid hash format')
    words=state.get('words');count=state.get('count');tail=state.get('tail')
    if not isinstance(words,list) or len(words)!=8 or any(type(n) is not int or not 0<=n<=MASK for n in words):raise ValueError('Invalid hash words')
    if type(count) is not int or not 0<=count<2**61 or not isinstance(tail,str) or len(tail)>126:raise ValueError('Invalid hash count')
    raw=bytes.fromhex(tail)
    if len(raw)!=count%64:raise ValueError('Invalid hash tail')
    return words[:],count,raw

def update(state,data):
    words,count,tail=checked(state);raw=tail+data
    for pos in range(0,len(raw)-63,64):
        w=list(struct.unpack_from('>16I',raw,pos))
        for i in range(16,64):
            x=w[i-15];y=w[i-2]
            w.append((w[i-16]+(rotate(x,7)^rotate(x,18)^(x>>3))+w[i-7]+(rotate(y,17)^rotate(y,19)^(y>>10)))&MASK)
        a,b,c,d,e,f,g,h=words
        for k,x in zip(K,w):
            t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^((~e)&g))+k+x)&MASK
            t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))&MASK
            h,g,f,e,d,c,b,a=g,f,e,(d+t1)&MASK,c,b,a,(t1+t2)&MASK
        words=[(x+y)&MASK for x,y in zip(words,(a,b,c,d,e,f,g,h))]
    return {'format':1,'words':words,'count':count+len(data),'tail':raw[(len(raw)//64)*64:].hex()}

def hexdigest(state):
    _,count,_=checked(state)
    padding=b'\x80'+b'\x00'*((55-count)%64)+struct.pack('>Q',count*8)
    result=update(state,padding)
    return ''.join(f'{word:08x}' for word in result['words'])
