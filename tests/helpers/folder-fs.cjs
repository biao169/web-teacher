function error(name){return Object.assign(Error(name),{name})}
function directory(name='parent'){
 const children=new Map();return {name,kind:'directory',children,
 async getDirectoryHandle(name,{create=false}={}){let item=children.get(name);if(item?.kind==='file')throw error('TypeMismatchError');if(!item){if(!create)throw error('NotFoundError');children.set(name,item=directory(name))}return item},
 async getFileHandle(name,{create=false}={}){let item=children.get(name);if(item?.kind==='directory')throw error('TypeMismatchError');if(!item){if(!create)throw error('NotFoundError');item={name,kind:'file',data:Buffer.alloc(0),writes:0,async createWritable(){let staged=Buffer.alloc(0);const target=this;return {async write({position,data}){if(target.fail)throw Error('disk full');target.writes++;const next=Buffer.alloc(Math.max(staged.length,position+data.byteLength));staged.copy(next);Buffer.from(data).copy(next,position);staged=next},async close(){if(target.closeFail)throw Error('close failed');target.data=staged},async abort(){staged=Buffer.alloc(0)}}}};children.set(name,item)}return item}
 };
}

module.exports={directory};
