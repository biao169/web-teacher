/** Isolated feature loading: failed helpers cannot disable saving, media or unrelated editors. */
const modules=[
 ['native-access.js?v=0.15.28','权限提示','body'],
 ['native-publications.js?v=0.15.40','论文辅助','[data-editor-table="publications"]'],
 ['native-metadata-query.js?v=0.15.40','论文检索','[data-metadata-standalone]'],
 ['native-history.js?v=0.15.25','历史输入建议','[data-history-field],#history-explorer'],
 ['native-editor.js','表单保存','#native-editor'],
 ['native-accounts.js?v=0.15.28','账号配置','[data-account-editor]'],
 ['native-source-focus.js?v=0.15.27','来源定位','body'],
 ['native-copy.js','复制操作','body'],
 ['native-sessions.js?v=0.15.32','登录会话','#tool-sessions'],
 ['native-message-logs.js','留言处理','[data-detail-status-save]'],
 ['native-student-categories.js','学生分类','[data-editor-table="student_category_displays"]'],
 ['native-navigation.js?v=0.15.92','导航配置','[data-editor-table="navigation_items"]'],
 ['native-field-help.js?v=0.15.88','字段说明','body'],
 ['native-media.js?v=0.15.113','媒体预览','.native-media-preview'],
 ['native-media-fields.js?v=0.15.33','媒体选择与上传','[data-media-field]'],
 ['native-media-audit.js','媒体目录核对','#media-audit'],
 ['native-services.js?v=0.15.29','服务辅助','[data-run-translation],[data-invalidate-translation],[data-queue-translation],[data-service-test],[data-service-recommend]'],
 ['native-translation-groups.js?v=0.15.29','翻译来源与版本','[data-translation-review]'],
 ['native-translation-batch.js?v=0.15.30','翻译批次','[data-translation-batch]']
];
function failed(label,selector){
 const target=document.querySelector(selector);if(!target)return;
 const notice=document.createElement('p');notice.className='native-feedback';notice.setAttribute('role','alert');notice.dataset.helperFailure=label;
 notice.textContent=label+'未能加载。请先保存当前填写，再重新打开页面；若仍失败，请检查静态资源是否完整。';
 (target.closest('.native-editor-section')||document.querySelector('.native-title')||document.body).append(notice);
}
function holdControls(selector,scope=document){
 const controls=[...scope.querySelectorAll(selector)].filter(control=>control.matches(':enabled'));
 controls.forEach(control=>control.disabled=true);return ()=>controls.forEach(control=>control.disabled=false);
}
async function initialize(){
 // Headers have their own dependency-free entry. Keep HTML search and pagination
 // available even if list actions fail to import; never disable the search submit.
 const root=document.querySelector('.native-list[data-table]:not([data-list-kind="audit"])');
 if(root){
  holdControls('[data-delete],[data-toggle-field],[data-media-status],[data-bulk-delete],[data-bulk-media],[data-bulk-message],[data-message-bulk-status],[data-media-upload],[data-page-size],[data-select-all],[data-select-row],[data-export-groups]',root);
  try{const {mountList}=await import('./native-list.js?v=0.15.42');mountList(root)}
  catch(error){
   root.dataset.listReady='failed';
   const status=root.querySelector('[data-list-load-status]');
   if(status){status.hidden=false;status.setAttribute('role','alert');status.textContent='列表操作未能加载；普通搜索、分页和已加载的表头仍可使用。请重新打开页面；若仍失败，请检查启动日志和静态资源请求。'}
   console.error('列表操作加载失败',error);
  }
 }
 // Avoid a burst of unrelated imports on a small VPS. Each feature still fails
 // independently; editor draft modules retain their existing submit lifecycle.
 for(const [file,label,selector] of modules){
  if(!document.querySelector(selector))continue;
  const release=holdControls(file.startsWith('native-publications.')?'[data-parse-citation],[data-generate-citations],[data-extract-profile],[data-auto-highlight],#metadata-fetch':file.startsWith('native-metadata-query.')?'[data-metadata-standalone] #metadata-fetch':file.startsWith('native-services.')?'[data-run-translation],[data-invalidate-translation],[data-queue-translation],[data-service-test],[data-service-recommend]':file==='native-message-logs.js'?'[data-detail-status-save]':'[data-no-controls]');
  try{await import('./'+file);release()}catch(error){failed(label,selector);console.error(label+'加载失败',error)}
 }
 document.documentElement.dataset.nativeReady='true';
}
initialize();
