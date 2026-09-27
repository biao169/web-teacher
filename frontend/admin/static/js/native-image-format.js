/** Only bounded numeric image geometry is persisted; all other styles are discarded. */
export const imageLayouts=['image-left','image-right','image-center','image-wide','image-align-left','image-align-right'];
export const imageSizes=['imageWidth','imageHeight','imageMinWidth','imageMinHeight'];
const attrs={imageWidth:'data-image-width',imageHeight:'data-image-height',imageMinWidth:'data-image-min-width',imageMinHeight:'data-image-min-height'};
export function imageSize(name,value){
 const match=/^([1-9][0-9]{0,3})(px|%)$/.exec(String(value||''));
 if(!match||!imageSizes.includes(name))return '';
 const n=Number(match[1]),unit=match[2];return unit==='%'?(name==='imageWidth'&&n<=100?match[0]:''):(n<=4096?match[0]:'');
}
export function imageGeometry(node){
 for(const key of imageSizes){const value=imageSize(key,node.getAttribute(attrs[key]));if(value)node.setAttribute(attrs[key],value);else node.removeAttribute(attrs[key])}
 node.removeAttribute('style');
 for(const [key,css] of [['imageWidth','width'],['imageHeight','height'],['imageMinWidth','min-width'],['imageMinHeight','min-height']]){
  const value=node.getAttribute(attrs[key]);if(value)node.style.setProperty(css,key==='imageMinWidth'?`min(100%, ${value})`:value);
 }
}
export function registerImage(Quill){
 const Image=Quill.import('formats/image');
 class ManagedImage extends Image{
  static create(value){const node=super.create(value);node.draggable=true;return node}
  html(){const node=this.domNode.cloneNode(true);node.removeAttribute('draggable');return node.outerHTML}
  static sanitize(value){return /^\/media\/[a-f0-9]{32}$/.test(String(value))?value:'//:0'}
  static formats(node){const formats=super.formats(node);delete formats.width;delete formats.height;return {...formats,layout:[...node.classList].find(c=>imageLayouts.includes(c))||'',...Object.fromEntries(imageSizes.map(key=>[key,imageSize(key,node.getAttribute(attrs[key])||(key==='imageWidth'&&node.getAttribute('width')?node.getAttribute('width')+'px':key==='imageHeight'&&node.getAttribute('height')?node.getAttribute('height')+'px':''))]))}}
  format(name,value){
   if(name==='layout')this.domNode.className=imageLayouts.includes(value)?value:'';
   else if(imageSizes.includes(name)){const normalized=imageSize(name,value);if(normalized)this.domNode.setAttribute(attrs[name],normalized);else this.domNode.removeAttribute(attrs[name]);imageGeometry(this.domNode)}
   else if(name==='width'||name==='height')this.format(name==='width'?'imageWidth':'imageHeight',/^\d+$/.test(String(value))?value+'px':value);
   else super.format(name,name==='alt'?String(value||'').slice(0,500):value);
  }
 }
 Quill.register(ManagedImage,true);
}
export function moveImage(editor,Quill,image,to){
 if(!image?.isConnected||!editor.root.contains(image)||!Number.isFinite(to))return false;
 const from=editor.getIndex(Quill.find(image));to=Math.max(0,Math.min(to,editor.getLength()-1));
 if(to===from||to===from+1)return false;
 const piece=editor.getContents(from,1),Delta=Quill.import('delta');
 const delta=to<from?new Delta().retain(to).concat(piece).retain(from-to).delete(1):new Delta().retain(from).delete(1).retain(to-from-1).concat(piece);
 editor.history.cutoff();editor.updateContents(delta,'user');editor.history.cutoff();editor.setSelection(to<from?to:to-1,1,'silent');return true;
}
export function dropIndex(editor,Quill,x,y){
 let range=document.caretRangeFromPoint?.(x,y);
 if(!range){const point=document.caretPositionFromPoint?.(x,y);if(point)range={startContainer:point.offsetNode,startOffset:point.offset}}
 if(!range||!editor.root.contains(range.startContainer))return null;
 let node=range.startContainer,offset=range.startOffset;
 if(node.nodeType===1){const atEnd=offset>=node.childNodes.length;node=node.childNodes[offset]||node.lastChild||node;while(node.nodeType===1&&node.childNodes.length)node=atEnd?node.lastChild:node.firstChild;offset=atEnd?(node.nodeType===3?node.textContent.length:1):0}
 const blot=Quill.find(node,true);return blot?editor.getIndex(blot)+offset:null;
}
