/** Pure image-space geometry. Panning/zooming never changes a crop rectangle or anchor. */
export const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function fitView(width,height,cw,ch){const scale=Math.min((cw-24)/width,(ch-24)/height);return {scale,x:(cw-width*scale)/2,y:(ch-height*scale)/2}}
export function imagePoint(view,p){return {x:(p.x-view.x)/view.scale,y:(p.y-view.y)/view.scale}}
export function zoomView(view,factor,p,min,max){const anchor=imagePoint(view,p),scale=clamp(view.scale*factor,min,max);return {scale,x:p.x-anchor.x*scale,y:p.y-anchor.y*scale}}
export function fullRect(width,height,ratio=0){const w=ratio?Math.min(width,height*ratio):width,h=ratio?w/ratio:height;return {x:(width-w)/2,y:(height-h)/2,w,h}}
export function pointRect(a,b,ratio,width,height){
 const end={x:clamp(b.x,0,width),y:clamp(b.y,0,height)},sx=end.x<a.x?-1:1,sy=end.y<a.y?-1:1;
 let w=Math.abs(end.x-a.x),h=Math.abs(end.y-a.y);
 if(ratio){w=Math.min(Math.max(w,h*ratio),sx<0?a.x:width-a.x,(sy<0?a.y:height-a.y)*ratio);h=w/ratio}
 return {x:sx<0?a.x-w:a.x,y:sy<0?a.y-h:a.y,w,h};
}
export function outputSize(rect,longEdge){
 if(!Number.isInteger(longEdge)||longEdge<64||longEdge>4096||rect.w<1||rect.h<1)throw Error('长边需为64–4096的整数，裁剪区域至少1像素');
 const factor=longEdge/Math.max(rect.w,rect.h),width=Math.round(rect.w*factor),height=Math.round(rect.h*factor);
 if(width<64||height<64||width>4096||height>4096)throw Error('输出宽高都需在64–4096像素内，请增大长边或调整比例');
 return {width,height};
}
