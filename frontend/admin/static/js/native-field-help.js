/** Shared contextual help for auxiliary controls; business fields are already described by Jinja. */
let sequence=0;const bound=new WeakSet();
const HELP=[
 ['#nav-route-preset','选择现有页面并生成路径；只修改当前草稿，保存后生效。'],
 ['#nav-target','选择内容模块；保留当前前台/后台位置，固定条件同时满足。'],
 ['[data-nav-size]','每页预览10、20、50或100条；只影响预览，不保存为导航条件。'],
 ['[data-match-size]','每页显示10、20、50或100名匹配学生；不修改分类规则。'],
 ['#permission-search','按模块名称筛选当前矩阵，最多100字符；隐藏模块的选择保持不变。'],
 ['#metadata-kind','自动识别DOI或题名，也可指定类型；不会保存到论文。'],
 ['#metadata-doi','输入DOI、doi.org链接或论文题名；查询输入最多350字符，核对后选择回填。'],
 ['#metadata-provider','默认仅查一个服务；回退按已配置顺序尝试，未启用的服务不可选。'],
 ['#picker-q','按名称、文件或分类检索，最多120字符；留空查看全部适用媒体。'],
 ['#picker-category','按分类筛选，最多200字符；留空不限分类。'],
 ['#picker-kind','仅显示当前字段允许使用的类型；不会更改原文件类型。'],
 ['[data-picker-size]','每页10或20个媒体；只改变当前选择窗口的分页。'],
 ['#picker-file','先选择本地文件再上传；适用类型及大小以上方当前字段提示为准。'],
 ['[data-picker-title]','媒体库标题，最多200字符；留空使用文件名。'],
 ['[data-picker-upload-category]','上传文件的分类，最多200字符；留空不分类。'],
 ['[data-picker-caption]','图片说明或PDF链接文字，最多500字符；只用于此次正文插入。'],
 ['[data-crop-ratio]','约束裁剪区域长宽比；改变比例不缩放原图。'],
 ['[data-crop-ratio-w]','自定义比例宽，整数1–10000；与比例高一起应用。'],
 ['[data-crop-ratio-h]','自定义比例高，整数1–10000；不是输出像素。'],
 ['[data-crop-zoom]','视图缩放25%–800%；不会提交裁剪选点或改变已选区域。'],
 ['[data-crop-x]','裁剪左上角X坐标，单位原图像素，不小于0。'],
 ['[data-crop-y]','裁剪左上角Y坐标，单位原图像素，不小于0。'],
 ['[data-crop-w]','裁剪宽度，单位原图像素；至少1且不能超出原图。'],
 ['[data-crop-h]','裁剪高度，单位原图像素；至少1且不能超出原图。'],
 ['[data-crop-edge]','输出长边64–4096像素；实际输出也受原图区域和总像素上限约束。'],
 ['[data-crop-format]','PNG保留透明；JPEG将透明区域填白。生成新文件，不覆盖原图。'],
];

export function attachHelp(control,text,{group=false}={}){
 // Reuse this for dynamic conditions and helper inputs; text never becomes executable markup.
 if(!control||bound.has(control))return;bound.add(control);
 const id='helper-description-'+(++sequence),help=document.createElement('small');help.id=id;help.className='native-field-help';help.textContent=text;
 control.setAttribute('aria-describedby',[control.getAttribute('aria-describedby'),id].filter(Boolean).join(' '));
 if(!control.title)control.title=text;
 if(group){control.closest('label')?.append(help);return}
 const wrapper=document.createElement('span');wrapper.className='native-help-control';
 control.before(wrapper);wrapper.append(control,help);
}

export function refreshOptionHelp(control){
 // Show the selected option's explanation in normal text, including on touch devices.
 const target=control.closest('.native-field')?.querySelector('[data-option-description]');
 if(target){target.textContent=control.selectedOptions[0]?.dataset.optionHelp||'';control.title=target.textContent}
}

function describeControls(root){
 // Only registered auxiliary controls are wrapped; unknown controls and list layouts are untouched.
 const controls=[...(root.matches?.('input,select,textarea')?[root]:[]),...root.querySelectorAll('input,select,textarea')];
 for(const control of controls){
  if(control.matches('[data-citation-lock]')){
   const field=control.closest('.native-field'),help=field?.querySelector('.native-field-help');
   if(help){control.setAttribute('aria-describedby',help.id);control.title='勾选保护此引文；取消后才允许自动重新生成。'}
  }else if(control.matches('.native-metadata-row input[type=checkbox]'))attachHelp(control,'仅回填此项建议；不会自动保存，之后可撤销。',{group:true});
  else{
   const match=HELP.find(([selector])=>control.matches(selector));if(match)attachHelp(control,match[1]);
  }
 }
}
describeControls(document);
document.querySelectorAll('.native-field select').forEach(control=>{
 if(!control.querySelector('[data-option-help]'))return;
 refreshOptionHelp(control);control.addEventListener('change',()=>refreshOptionHelp(control));control.addEventListener('input',()=>refreshOptionHelp(control));
});
// Observe only editable/helper regions, not list rows or the entire workspace.
const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)describeControls(node)});
document.querySelectorAll('#native-editor,[data-media-picker],[data-media-crop],[data-metadata-standalone]').forEach(root=>observer.observe(root,{childList:true,subtree:true}));
