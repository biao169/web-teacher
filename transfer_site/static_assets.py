TRANSFER_CSS = r"""
.transfer-app,.transfer-admin{max-width:1180px;margin:0 auto;padding:30px 18px;color:#18212f;font-family:Inter,Segoe UI,Arial,sans-serif}
.transfer-hero,.transfer-admin-head{display:flex;justify-content:space-between;gap:22px;align-items:flex-start;margin-bottom:20px}
.transfer-kicker{margin:0 0 6px;color:#357067;font-size:.84rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.transfer-hero h1,.transfer-admin-head h1{margin:0;font-size:clamp(2rem,4vw,3.25rem);letter-spacing:0;color:#13202b}
.transfer-hero p,.transfer-admin-head p{max-width:720px;margin:10px 0 0;color:#586875;line-height:1.6}
.transfer-side-status{display:grid;gap:10px;min-width:270px}.transfer-language{display:flex;justify-content:flex-end;gap:8px}.transfer-language a,.transfer-language span{border:1px solid #d5e2e5;border-radius:999px;padding:6px 10px;text-decoration:none;color:#27414a;background:#fff;font-size:.86rem}.transfer-language span{background:#e8f4f1;color:#176b5c;font-weight:800}
.transfer-status{display:grid;gap:8px;padding:14px;border:1px solid #d7e4e7;background:#f7fbfb;border-radius:8px}.transfer-status span{display:inline-flex;align-items:center;gap:6px;font-size:.9rem}.transfer-status.is-blocked{border-color:#e9b1a8;background:#fff7f5}
.transfer-alerts ul{margin:0 0 16px;padding:12px 16px 12px 34px;border-radius:8px;background:#fff8e6;border:1px solid #ead79c}.transfer-alerts ul.error{background:#fff3f1;border-color:#e7b2aa}.transfer-alerts ul.info{background:#eef8f5;border-color:#b9dcd5}
.transfer-mode-tabs{display:flex;gap:8px;margin:0 0 18px;border-bottom:1px solid #dfe7ea}.transfer-mode-tabs button{border:0;background:transparent;color:#51636e;padding:12px 14px;font-weight:800;cursor:pointer;border-bottom:3px solid transparent}.transfer-mode-tabs button.is-active{color:#176b5c;border-bottom-color:#176b5c}
.transfer-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.transfer-app[data-active-mode="send"] [data-panel="receive"],.transfer-app[data-active-mode="receive"] [data-panel="send"]{display:none}.transfer-app[data-active-mode="send"] .transfer-grid,.transfer-app[data-active-mode="receive"] .transfer-grid{grid-template-columns:minmax(0,820px)}
.transfer-panel,.transfer-table-panel,.transfer-control-form{border:1px solid #dfe7ea;background:#fff;border-radius:8px;padding:18px;box-shadow:0 14px 34px rgba(21,35,44,.07)}.transfer-panel-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px}.transfer-panel h2,.transfer-table-panel h2{margin:0;font-size:1.22rem;color:#18212f}.transfer-panel-note,.transfer-room p{margin:4px 0 12px;color:#63717c;font-size:.92rem;line-height:1.55}
.transfer-mode-select{display:grid;gap:5px;min-width:310px}.transfer-mode-select span,.transfer-field span{font-size:.82rem;color:#52636e;font-weight:800}.transfer-mode-select select,.transfer-field input,.transfer-control-form input,.transfer-control-form select{border:1px solid #cfdce0;border-radius:6px;padding:9px 10px;background:#fff;min-height:38px}.transfer-mode-select select{font-family:"Cascadia Mono","SFMono-Regular",Consolas,monospace;font-size:.86rem}.transfer-mode-note{margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#f3f8f7;border:1px solid #d9e8e4;color:#405660;font-size:.92rem}
.transfer-drop{display:grid;place-items:center;text-align:center;gap:8px;min-height:220px;border:2px dashed #9ebcc4;background:#f6fbfc;border-radius:8px;padding:18px;transition:.2s ease}.transfer-drop.is-over{background:#eaf7f4;border-color:#247d6d}.transfer-drop strong{font-size:1.08rem}.transfer-drop span,.transfer-room span{color:#63717c;font-size:.92rem}.transfer-drop-actions,.transfer-actions,.transfer-admin-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.transfer-drop button,.transfer-actions button,.transfer-admin button,.transfer-admin-actions button,.transfer-admin-nav a{border:0;border-radius:6px;background:#176b5c;color:#fff;padding:10px 14px;font-weight:800;text-decoration:none;cursor:pointer}.transfer-actions button:disabled{background:#aebbc0;cursor:not-allowed}.transfer-drop button:nth-child(2),.transfer-admin-nav a:nth-child(2){background:#e8f0f2;color:#20313a}
.transfer-room{display:grid;gap:8px;margin:14px 0;padding:12px;border-radius:8px;background:#eef7f3}.transfer-room div{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center}.transfer-room code{word-break:break-all}.transfer-room button{border:0;border-radius:6px;background:#176b5c;color:#fff;padding:7px 10px;font-weight:800;cursor:pointer}.transfer-list{display:grid;gap:8px;margin-top:12px;max-height:300px;overflow:auto}.transfer-item{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;border:1px solid #e0e8eb;border-radius:7px;background:#fbfdfd}.transfer-item small{color:#687883}.transfer-field{display:grid;gap:6px;margin-bottom:10px}.transfer-progress{margin-top:16px}.transfer-progress div{display:flex;justify-content:space-between;margin-bottom:6px;color:#52636e}.transfer-progress progress{width:100%;height:14px}
.transfer-mode-guide{margin-top:18px}.transfer-mode-guide h3{margin:0 0 10px;font-size:1rem}.transfer-mode-guide>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.transfer-mode-guide article{border:1px solid #dfe8ea;border-radius:8px;padding:12px;background:#fbfdfd}.transfer-mode-guide strong{display:block}.transfer-mode-guide span{display:inline-block;margin:7px 0 4px;padding:3px 7px;border-radius:999px;background:#e9f2f0;color:#176b5c;font-size:.75rem;font-family:"Cascadia Mono",Consolas,monospace}.transfer-mode-guide p{margin:0;color:#5b6b75;line-height:1.45;font-size:.9rem}
.transfer-admin{max-width:1240px}.transfer-admin-head{position:relative;padding:58px 20px 20px;border:1px solid #dce8eb;border-radius:8px;background:linear-gradient(180deg,#fbfdfd,#f4faf8)}.transfer-admin-language-corner{position:absolute;top:16px;right:20px;z-index:5}.transfer-admin-language-corner .transfer-language{justify-content:flex-end}.transfer-admin-tools{display:grid;gap:10px;justify-items:end}.transfer-admin-nav{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.transfer-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}.transfer-metrics article{padding:16px;border:1px solid #dde8eb;border-radius:8px;background:#f8fbfb}.transfer-metrics span{display:block;color:#63717c;font-size:.86rem}.transfer-metrics strong{display:block;margin-top:6px;font-size:1.15rem;color:#172630}.transfer-control-form{display:grid;gap:16px;margin-bottom:16px}.transfer-control-form fieldset{border:1px solid #dfe7ea;border-radius:8px;padding:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.transfer-control-form legend{font-weight:900;padding:0 6px}.transfer-admin-field{display:grid;gap:6px;font-size:.92rem}.transfer-admin-field span{color:#283b45;font-weight:800}.transfer-admin-field small{color:#687883;line-height:1.4}.transfer-admin-field-toggle{grid-template-columns:1fr auto;align-items:center}.transfer-admin-field-toggle small{grid-column:1 / -1}.transfer-table-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;margin-bottom:10px}.transfer-table-head p{margin:0;color:#60717b}.transfer-table{width:100%;border-collapse:collapse}.transfer-table th,.transfer-table td{padding:11px;border-bottom:1px solid #e5ecef;text-align:left;font-size:.92rem}.transfer-table th{background:#f4f8f9}.transfer-admin-badge{display:inline-block;padding:3px 8px;border-radius:999px;background:#e9f2f0;color:#176b5c;font-size:.78rem;font-weight:800}

.transfer-admin{padding-bottom:110px}.transfer-admin-head{box-shadow:0 18px 40px rgba(24,42,54,.08)}.transfer-control-form{gap:18px}.transfer-control-form fieldset{background:#fbfdfd;box-shadow:0 10px 26px rgba(30,48,58,.04)}.transfer-control-form legend{color:#172630;font-size:1rem}.transfer-admin-field{padding:10px 12px;border:1px solid #edf2f4;border-radius:8px;background:#fff}.transfer-admin-field-toggle{grid-template-columns:1fr;align-items:start}.transfer-admin-toggle-line{display:inline-flex;align-items:center;gap:8px;width:max-content;max-width:100%}.transfer-admin-toggle-line input[type=checkbox]{width:18px;height:18px;margin:0;accent-color:#176b5c}.transfer-admin-field-toggle small{grid-column:auto}.transfer-admin-actions{position:sticky;bottom:0;z-index:30;align-items:center;justify-content:flex-end;padding:14px 16px;margin:4px -18px -18px;border-top:1px solid #dce8eb;background:rgba(248,251,251,.94);backdrop-filter:blur(10px);box-shadow:0 -12px 28px rgba(19,32,43,.08)}.transfer-admin-save-state{margin-right:auto;color:#176b5c;font-weight:800}.transfer-admin-actions button[type=button]{background:#eef3f4;color:#21343d}.transfer-app[data-receive-only="1"] [data-transfer-tab="send"],.transfer-app[data-receive-only="1"] [data-panel="send"]{display:none!important}
.transfer-task-table{min-width:1240px}.transfer-table-panel{overflow:auto}.transfer-admin-compact{display:grid;gap:3px;min-width:170px}.transfer-admin-compact strong{font-size:.86rem;color:#15232c}.transfer-admin-compact span,.transfer-admin-time{display:block;color:#647580;font-size:.78rem;line-height:1.35}.transfer-admin-action-set{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap;min-width:210px}.transfer-admin-action-set button{padding:7px 9px;font-size:.78rem;border-radius:6px}.transfer-admin-action-set [data-admin-delete]{background:#eef2f4;color:#20313a}.transfer-admin-action-set [data-admin-destroy]{background:#b42318;color:#fff}.transfer-task-table th:last-child,.transfer-task-table td:last-child{text-align:right}
@media (max-width: 860px){.transfer-admin-language-corner{position:static;margin-bottom:12px}.transfer-hero,.transfer-admin-head,.transfer-panel-head,.transfer-table-head{display:grid}.transfer-grid,.transfer-metrics,.transfer-mode-guide>div{grid-template-columns:1fr}.transfer-control-form fieldset{grid-template-columns:1fr}.transfer-side-status,.transfer-mode-select{min-width:0}.transfer-language{justify-content:flex-start}.transfer-room div{grid-template-columns:1fr}}
"""

TRANSFER_JS = r"""
(() => {
  const root = document.querySelector('[data-transfer-root]');
  if (!root) return;
  const $ = (sel) => root.querySelector(sel);
  const lang = root.dataset.lang === 'zh' ? 'zh' : 'en';
  const receiveOnly = root.dataset.receiveOnly === '1';
  const messages = {
    en: {
      taskUsage: 'This task', waiting: 'Waiting', transferring: 'Transferring', upload: 'Uploading', download: 'Downloading',
      chooseFiles: 'Choose at least one file or folder first.', created: 'Transfer task created.', uploaded: 'Upload complete. The receiver can download the files with the folder structure.',
      roomRequired: 'Enter a room ID.', connected: 'Connected to the transfer task.', noDirectory: 'This browser cannot choose a save folder directly. Browser downloads will be used instead.',
      directoryChosen: 'Save folder selected.', downloadFailed: 'Download failed.', downloadDone: 'Download complete.', copied: 'Share link copied.', copyFailed: 'Copy failed. Please copy the link manually.',
      stopped: 'Task stopped.', statusFailed: 'Status check failed.', sharedRoom: 'Room ID loaded from the shared link. Check the access code, then connect.', fileWaiting: 'Waiting'
    },
    zh: {
      taskUsage: '本任务', waiting: '等待任务', transferring: '传输中', upload: '上传', download: '下载',
      chooseFiles: '请先选择文件或文件夹。', created: '传输任务已创建。', uploaded: '上传完成，接收端可以按文件夹结构下载。',
      roomRequired: '请输入房间号。', connected: '已连接传输任务。', noDirectory: '当前浏览器不支持直接选择保存目录，将使用浏览器下载方式。',
      directoryChosen: '已选择保存目录。', downloadFailed: '下载失败', downloadDone: '下载完成。', copied: '分享链接已复制。', copyFailed: '复制失败，请手动复制分享链接。',
      stopped: '任务已中断。', statusFailed: '状态检查失败。', sharedRoom: '已填入分享链接中的房间号，请确认随机码后连接。', fileWaiting: '等待'
    }
  };
  const t = (key) => (messages[lang] || messages.en)[key] || messages.en[key] || key;
  const modeText = {
    en: {
      auto: 'Smart route. Tries local/direct first, then falls back to allowed relay or storage paths.',
      lan: 'Fastest when sender and receiver are on the same LAN. Usually avoids server traffic.',
      relay: 'Live transfer through the server. Good for different networks; speed depends on server bandwidth.',
      cloud_relay: 'Live transfer through a configured cloud relay. Best for distant users when enabled.',
      temp_local: 'Stores files temporarily on the server so the receiver can download later. Subject to expiry and quotas.',
      temp_cloud: 'Stores files temporarily in configured cloud storage. Best for large remote transfers when enabled.'
    },
    zh: {
      auto: '智能选择。优先尝试本地/直连，再回退到允许的中转或暂存路径。',
      lan: '发送方和接收方在同一局域网时最快，通常不占服务器流量。',
      relay: '通过服务器实时转发，适合跨网络；速度取决于服务器带宽。',
      cloud_relay: '通过已配置的云中转节点实时转发，适合远距离用户。',
      temp_local: '临时存到服务器，接收方可稍后下载；受有效期和配额限制。',
      temp_cloud: '临时存到已配置云存储，适合大文件远程传输。'
    }
  };
  const state = { files: [], session: null, code: '', directory: null, received: [] };
  const chunkSize = 1024 * 1024;

  function setMode(mode) {
    const active = mode === 'receive' ? 'receive' : 'send';
    root.dataset.activeMode = active;
    root.querySelectorAll('[data-transfer-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.transferTab === active));
  }
  function updateTaskUsage(bytes) {
    const node = $('[data-task-usage]');
    if (node) node.textContent = `${t('taskUsage')} ${formatBytes(bytes || 0)}`;
  }
  function updateModeNote() {
    const select = $('[data-transfer-mode]');
    const note = $('[data-mode-note]');
    if (select && note) note.textContent = (modeText[lang] || modeText.en)[select.value] || '';
  }
  function show(message, kind='info') {
    const box = $('[data-transfer-alerts]');
    box.innerHTML = message ? `<ul class="${kind}"><li>${escapeHtml(message)}</li></ul>` : '';
  }
  function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function formatBytes(value) {
    let size = Number(value || 0);
    const units = ['B','KB','MB','GB','TB'];
    let i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return i ? `${size.toFixed(1)} ${units[i]}` : `${Math.round(size)} ${units[i]}`;
  }
  function filePath(file) { return file.webkitRelativePath || file.relativePath || file.name; }
  function renderFiles() {
    const list = $('[data-transfer-list]');
    list.innerHTML = state.files.map((file) => `<div class="transfer-item"><div><strong>${escapeHtml(filePath(file))}</strong><br><small>${formatBytes(file.size)}</small></div><small data-file-status="${escapeHtml(filePath(file))}">${t('fileWaiting')}</small></div>`).join('');
  }
  function setProgress(done, total, label) {
    const pct = total ? Math.floor((done / total) * 100) : 0;
    $('[data-progress-label]').textContent = label || t('transferring');
    $('[data-progress-percent]').textContent = `${pct}%`;
    $('[data-progress-bar]').value = pct;
    updateTaskUsage(done);
  }
  async function api(url, options={}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {ok:false, message:text}; }
    if (!response.ok || data.ok === false) throw new Error(data.message || `Request failed (${response.status})`);
    return data;
  }
  async function pollStatus() {
    try {
      const data = await api('/api/transfer/status');
      const resources = data.resources || {};
      const blockers = resources.blockers || [];
      const warnings = resources.warnings || [];
      if (blockers.length) show(blockers.join('; '), 'error');
      else if (warnings.length) show(warnings.join('; '), 'warn');
    } catch (error) { show(error.message || t('statusFailed'), 'error'); }
  }
  async function createSession() {
    const mode = $('[data-transfer-mode]').value;
    const data = await api('/api/transfer/sessions', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({mode})});
    state.session = data.session;
    state.code = data.session.access_code;
    const link = `${location.origin}/transfer/receive/${data.session.room_id}?code=${encodeURIComponent(state.code)}&lang=${lang}`;
    $('[data-transfer-room]').hidden = false;
    $('[data-room-link]').textContent = link;
    $('[data-room-code]').textContent = state.code;
    $('[data-join-room]').value = data.session.room_id;
    $('[data-join-code]').value = state.code;
    $('[data-start-upload]').disabled = state.files.length === 0;
    $('[data-stop-session]').disabled = false;
    show(t('created'));
  }
  async function uploadAll() {
    if (!state.session) await createSession();
    if (!state.files.length) return show(t('chooseFiles'), 'warn');
    let total = state.files.reduce((sum, file) => sum + file.size, 0);
    let done = 0;
    for (const file of state.files) {
      const rel = filePath(file);
      const meta = await api(`/api/transfer/sessions/${state.session.room_id}/objects?code=${encodeURIComponent(state.code)}`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({relative_path: rel, display_name:file.name, size_bytes:file.size, object_type:'file'})});
      let offset = 0;
      while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize);
        await api(`/api/transfer/sessions/${state.session.room_id}/objects/${meta.object.uid}/chunk?offset=${offset}&code=${encodeURIComponent(state.code)}`, {method:'POST', body:chunk});
        offset += chunk.size;
        done += chunk.size;
        setProgress(done, total, `${t('upload')} ${rel}`);
      }
    }
    await api(`/api/transfer/sessions/${state.session.room_id}/finish?code=${encodeURIComponent(state.code)}`, {method:'POST'});
    show(t('uploaded'));
    await refreshReceiveList();
  }
  async function joinSession() {
    const room = $('[data-join-room]').value.trim();
    const code = $('[data-join-code]').value.trim() || new URLSearchParams(location.search).get('code') || '';
    if (!room) return show(t('roomRequired'), 'warn');
    const data = await api(`/api/transfer/sessions/${encodeURIComponent(room)}/join`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({code})});
    state.session = data.session;
    state.code = code;
    await refreshReceiveList();
    $('[data-download-all]').disabled = false;
    show(t('connected'));
  }
  async function refreshReceiveList() {
    const room = state.session?.room_id || $('[data-join-room]').value.trim();
    const code = state.code || $('[data-join-code]').value.trim() || new URLSearchParams(location.search).get('code') || '';
    if (!room) return;
    const data = await api(`/api/transfer/sessions/${encodeURIComponent(room)}/objects?code=${encodeURIComponent(code)}`);
    state.received = data.objects || [];
    $('[data-receive-list]').innerHTML = state.received.map((obj) => `<div class="transfer-item"><div><strong>${escapeHtml(obj.relative_path)}</strong><br><small>${formatBytes(obj.size_bytes)} · ${escapeHtml(obj.status)}</small></div><small>${escapeHtml(obj.storage_backend)}</small></div>`).join('');
  }
  async function chooseDirectory() {
    if (!window.showDirectoryPicker) return show(t('noDirectory'), 'warn');
    state.directory = await window.showDirectoryPicker();
    show(t('directoryChosen'));
  }
  async function ensureDir(rootHandle, parts) {
    let dir = rootHandle;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, {create:true});
    return dir;
  }
  async function downloadAll() {
    await refreshReceiveList();
    const room = state.session?.room_id || $('[data-join-room]').value.trim();
    const code = state.code || $('[data-join-code]').value.trim() || new URLSearchParams(location.search).get('code') || '';
    let total = state.received.reduce((sum, obj) => sum + Number(obj.size_bytes || 0), 0);
    let done = 0;
    for (const obj of state.received.filter((item) => item.object_type !== 'directory')) {
      const parts = String(obj.relative_path || obj.display_name || obj.uid).split('/').filter(Boolean);
      const filename = parts.pop() || 'download.bin';
      let writer = null;
      if (state.directory && window.showDirectoryPicker) {
        const dir = await ensureDir(state.directory, parts);
        const handle = await dir.getFileHandle(filename, {create:true});
        writer = await handle.createWritable();
      }
      let offset = 0;
      const buffers = [];
      while (offset < Number(obj.size_bytes || 0)) {
        const response = await fetch(`/api/transfer/sessions/${encodeURIComponent(room)}/objects/${obj.uid}/chunk?offset=${offset}&limit=${chunkSize}&code=${encodeURIComponent(code)}`);
        if (!response.ok) {
          let message = t('downloadFailed');
          try { message = (await response.clone().json()).message || message; } catch {}
          throw new Error(message);
        }
        const chunk = await response.arrayBuffer();
        if (!chunk.byteLength) break;
        if (writer) await writer.write(chunk); else buffers.push(chunk);
        offset += chunk.byteLength;
        done += chunk.byteLength;
        setProgress(done, total, `${t('download')} ${obj.relative_path}`);
      }
      if (writer) await writer.close();
      if (!writer) {
        const blob = new Blob(buffers);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    }
    show(t('downloadDone'));
  }
  function addFiles(list) {
    state.files = [...state.files, ...Array.from(list || [])];
    renderFiles();
    $('[data-start-upload]').disabled = !state.session || state.files.length === 0;
  }
  $('[data-transfer-mode]')?.addEventListener('change', updateModeNote);
  $('[data-transfer-drop]')?.addEventListener('dragover', (event) => { event.preventDefault(); event.currentTarget.classList.add('is-over'); });
  $('[data-transfer-drop]')?.addEventListener('dragleave', (event) => event.currentTarget.classList.remove('is-over'));
  $('[data-transfer-drop]')?.addEventListener('drop', (event) => { event.preventDefault(); event.currentTarget.classList.remove('is-over'); addFiles(event.dataTransfer.files); });
  $('[data-pick-files]')?.addEventListener('click', () => $('[data-transfer-files]').click());
  $('[data-pick-folder]')?.addEventListener('click', () => $('[data-transfer-folder]').click());
  $('[data-transfer-files]')?.addEventListener('change', (event) => addFiles(event.target.files));
  $('[data-transfer-folder]')?.addEventListener('change', (event) => addFiles(event.target.files));
  root.querySelectorAll('[data-transfer-tab]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.transferTab)));
  $('[data-copy-link]')?.addEventListener('click', async () => {
    const text = $('[data-room-link]')?.textContent || '';
    if (!text) return;
    try { await navigator.clipboard.writeText(text); show(t('copied')); }
    catch { show(t('copyFailed'), 'warn'); }
  });
  $('[data-create-session]')?.addEventListener('click', () => createSession().catch((e) => show(e.message, 'error')));
  $('[data-start-upload]')?.addEventListener('click', () => uploadAll().catch((e) => show(e.message, 'error')));
  $('[data-join-session]')?.addEventListener('click', () => joinSession().catch((e) => show(e.message, 'error')));
  $('[data-choose-directory]')?.addEventListener('click', () => chooseDirectory().catch((e) => show(e.message, 'error')));
  $('[data-download-all]')?.addEventListener('click', () => downloadAll().catch((e) => show(e.message, 'error')));
  $('[data-stop-session]')?.addEventListener('click', async () => {
    if (!state.session) return;
    await api(`/api/transfer/sessions/${state.session.room_id}/stop?code=${encodeURIComponent(state.code)}`, {method:'POST'});
    show(t('stopped'));
  });
  if (receiveOnly) { root.querySelector('[data-transfer-tab="send"]')?.setAttribute('hidden','hidden'); root.querySelector('[data-panel="send"]')?.setAttribute('hidden','hidden'); }
  const initialRoom = root.dataset.room;
  setMode(receiveOnly || root.dataset.receive === '1' || initialRoom ? 'receive' : 'send');
  updateModeNote();
  if (initialRoom) {
    $('[data-join-room]').value = initialRoom;
    $('[data-join-code]').value = new URLSearchParams(location.search).get('code') || '';
    show(t('sharedRoom'));
  }
  pollStatus();
  setInterval(pollStatus, 10000);
})();
"""
