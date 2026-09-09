import {loadConfig,assertRuntime} from '../server/config.mjs';
import {acquireRuntimeLock} from '../server/runtime-lock.mjs';
import {openStorage} from '../server/storage.mjs';
import {createAccounts,installAccounts} from '../server/accounts.mjs';
assertRuntime();const config=loadConfig(),release=acquireRuntimeLock(config);let storage;
try{storage=openStorage(config);installAccounts(storage.accountsDB);const accounts=createAccounts(storage.accountsDB,storage);if(!accounts.needsSetup())throw new Error('Already initialized; existing accounts were not changed.');let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>2048)throw new Error('Input too large')};const[name,password]=text.split(/\r?\n/);const user=await accounts.create({name,password},true);console.log(JSON.stringify({initialized:true,uid:user.uid,name:user.name}));}catch(e){console.error(e.code||e.message);process.exitCode=1}finally{storage?.close();release()}
