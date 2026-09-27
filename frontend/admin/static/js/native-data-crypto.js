// Versioned ACMS envelope. Native WebCrypto supplies authenticated encryption;
// parsing bounds and fixed KDF parameters prevent a hostile file choosing CPU cost.
const encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
export const MAX_PLAIN=32*1024*1024, MAX_FILE=48*1024*1024;
export function base64(bytes){
 let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);
}
export function unbase64(text,limit=MAX_FILE){
 if(typeof text!=='string'||text.length>Math.ceil(limit/3)*4||text.length%4!==0||/[^A-Za-z0-9+/=]/.test(text)||!/^={0,2}$/.test(text.slice(text.indexOf('=')<0?text.length:text.indexOf('='))))throw Error('备份编码无效或超过大小上限');
 const raw=atob(text);if(raw.length>limit)throw Error('备份超过大小上限');return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function key(password,salt){
 if(!globalThis.crypto?.subtle)throw Error('加密备份需要HTTPS或本机localhost安全环境');
 if(typeof password!=='string'||password.length<15||password.length>128)throw Error('备份口令需要15–128位');
 const source=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},source,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptDocument(document,password){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=encoder.encode(JSON.stringify(document));if(bytes.length>MAX_PLAIN)throw Error('加密包明文超过32MiB，请缩小范围');
 const aad=encoder.encode('academic-cms-python-acms-v1');
 try{const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},await key(password,salt),bytes);
 return JSON.stringify({format:'academic-cms-python-acms-v1',cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,salt:base64(salt),iv:base64(iv),data:base64(new Uint8Array(data))});
 }finally{bytes.fill(0)}
}
export async function decryptDocument(text,password){
 const v=JSON.parse(text);
 if(v?.format!=='academic-cms-python-acms-v1'||v.cipher!=='AES-256-GCM'||v.kdf!=='PBKDF2-SHA256'||v.iterations!==600000)throw Error('不支持的ACMS格式或加密参数');
 const salt=unbase64(v.salt,16),iv=unbase64(v.iv,12),data=unbase64(v.data,MAX_PLAIN+16);
 if(salt.length!==16||iv.length!==12||data.length<16)throw Error('ACMS文件结构无效');
 let plain;try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(v.format),tagLength:128},await key(password,salt),data));}
 catch{throw Error('解密失败：口令不正确，或文件已损坏/被修改')}
 try{return JSON.parse(decoder.decode(plain))}finally{plain.fill(0)}
}
