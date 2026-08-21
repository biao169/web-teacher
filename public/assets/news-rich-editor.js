(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const editor = $("[data-rich-editor]");
  const preview = $("[data-rich-preview]");
  const statusNode = $("[data-rich-status]");
  const mediaDialog = $("[data-media-dialog]");
  const mediaList = $("[data-media-list]");
  const mediaStatus = $("[data-media-status]");
  const mediaSearch = $("[data-media-search]");
  const mediaFile = $("[data-media-file]");
  const mediaTools = $("[data-media-tools]");
  const mediaWidth = $("[data-media-width]");
  const mediaHeight = $("[data-media-height]");
  const mediaMinWidth = $("[data-media-min-width]");
  const mediaMinHeight = $("[data-media-min-height]");
  const mediaRatio = $("[data-media-ratio]");
  let savedRange = null;
  let sourceField = null;
  let formatField = null;
  let selectedMedia = null;
  let selectedMediaRatio = 0;
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

  const setStatus = (message, isError = false) => {
    if (!statusNode) return;
    statusNode.textContent = message || "";
    statusNode.style.color = isError ? "#a43a2f" : "";
  };

  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

  const formatBytes = (value) => {
    const size = Number(value || 0);
    if (!size) return "未知大小";
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    if (size >= 1024) return `${Math.round(size / 1024)} KB`;
    return `${size} B`;
  };

  const plainTextToRichHtml = (value) => {
    const text = String(value || "").trim();
    if (!text) return "<p><br></p>";
    return text.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  };

  const sanitizeRichHtml = (html) => {
    const holder = document.createElement("div");
    holder.innerHTML = String(html || "");
    holder.querySelectorAll("script,style,iframe,object,embed,form,input,button,textarea,select,meta,link").forEach((node) => node.remove());
    holder.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value || "";
        if (name.startsWith("on")) node.removeAttribute(attr.name);
        if ((name === "src" || name === "href") && /^(javascript|data):/i.test(value)) node.removeAttribute(attr.name);
      });
    });
    return holder.innerHTML.trim();
  };

  const editorHtmlForSave = () => {
    const holder = document.createElement("div");
    holder.innerHTML = editor?.innerHTML || "";
    holder.querySelectorAll(".rich-media-selected").forEach((node) => node.classList.remove("rich-media-selected"));
    holder.querySelectorAll("img,video").forEach((media) => {
      media.classList.remove("is-rich-media-fixed-active");
      media.removeAttribute("draggable");
      media.removeAttribute("contenteditable");
      media.removeAttribute("tabindex");
      media.removeAttribute("data-rich-media-bound");
      media.style.removeProperty("--rich-fixed-left");
      media.style.removeProperty("--rich-fixed-width");
      media.style.removeProperty("--rich-fixed-height");
    });
    return holder.innerHTML;
  };

  const connectOpener = () => {
    try {
      if (!window.opener || window.opener.closed) {
        sourceField = null;
        formatField = null;
        return false;
      }
      sourceField = window.opener.document.querySelector(".news-edit-form [data-news-rich-source]");
      formatField = window.opener.document.querySelector(".news-edit-form [name='content_format']");
      return Boolean(sourceField);
    } catch (error) {
      sourceField = null;
      formatField = null;
      return false;
    }
  };

  const refreshPreview = () => {
    if (preview) preview.innerHTML = sanitizeRichHtml(editorHtmlForSave());
  };

  const loadFromOpener = () => {
    if (!connectOpener()) {
      setStatus("没有连接到原动态编辑页。请从动态编辑页按钮重新打开此窗口。", true);
      return;
    }
    const format = formatField?.value || "plain";
    editor.innerHTML = format === "html" ? (sourceField.value || "<p><br></p>") : plainTextToRichHtml(sourceField.value || "");
    prepareEditorMedia();
    refreshPreview();
    setStatus("已读取原动态编辑页正文。");
  };

  const applyToOpener = () => {
    if (!connectOpener()) {
      setStatus("原动态编辑页已关闭，无法回写正文。", true);
      return;
    }
    const html = sanitizeRichHtml(editorHtmlForSave());
    sourceField.value = html;
    sourceField.dispatchEvent(new Event("input", { bubbles: true }));
    sourceField.dispatchEvent(new Event("change", { bubbles: true }));
    if (formatField) {
      formatField.value = "html";
      formatField.dispatchEvent(new Event("input", { bubbles: true }));
      formatField.dispatchEvent(new Event("change", { bubbles: true }));
    }
    refreshPreview();
    setStatus("已应用到原动态编辑页。请回到原页面保存动态。");
  };

  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (!savedRange) {
      editor.focus();
      return;
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
  };

  const runCommand = (command, value = null) => {
    restoreSelection();
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(command, false, value);
    saveSelection();
    refreshPreview();
  };

  const currentImage = () => {
    const selection = window.getSelection();
    const node = selection?.anchorNode?.nodeType === 1 ? selection.anchorNode : selection?.anchorNode?.parentElement;
    return node?.closest?.("img,video") || null;
  };

  const mediaBox = (media) => {
    const rect = media?.getBoundingClientRect?.();
    return {
      width: Math.round(Number.parseFloat(media?.style?.width || "") || rect?.width || media?.naturalWidth || media?.videoWidth || 0),
      height: Math.round(Number.parseFloat(media?.style?.height || "") || rect?.height || media?.naturalHeight || media?.videoHeight || 0),
    };
  };

  const readSizeInput = (input, defaultUnit = "px") => {
    const raw = String(input?.value || "").trim().toLowerCase();
    if (!raw) return { css: "", number: 0, unit: "" };
    const match = raw.match(/^(\d+(?:\.\d+)?)(px|%)?$/);
    if (!match) return { css: "", number: 0, unit: "", invalid: true };
    const number = Math.max(0, Number(match[1]));
    const unit = match[2] || defaultUnit;
    if (!number) return { css: "", number: 0, unit };
    const shown = Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
    return { css: `${shown}${unit}`, number, unit };
  };

  const styleSizeValue = (value, fallback = "") => {
    const text = String(value || "").trim();
    return text || fallback;
  };

  const selectMedia = (media) => {
    if (!media || !editor?.contains(media)) return;
    selectedMedia?.classList.remove("rich-media-selected");
    selectedMedia = media;
    selectedMedia.classList.add("rich-media-selected");
    selectedMediaRatio = (selectedMedia.naturalWidth && selectedMedia.naturalHeight)
      ? selectedMedia.naturalWidth / selectedMedia.naturalHeight
      : (selectedMedia.videoWidth && selectedMedia.videoHeight)
        ? selectedMedia.videoWidth / selectedMedia.videoHeight
        : 0;
    const box = mediaBox(selectedMedia);
    if (mediaWidth) mediaWidth.value = styleSizeValue(selectedMedia.style.width, box.width ? `${box.width}px` : "");
    if (mediaHeight) mediaHeight.value = styleSizeValue(selectedMedia.style.height, box.height ? `${box.height}px` : "");
    if (mediaMinWidth) mediaMinWidth.value = styleSizeValue(selectedMedia.style.minWidth, "48px");
    if (mediaMinHeight) mediaMinHeight.value = styleSizeValue(selectedMedia.style.minHeight, "32px");
    if (mediaTools) mediaTools.hidden = false;
    setStatus(`已选中媒体：${box.width || "自动"} x ${box.height || "自动"}，可拖动位置或修改尺寸。`);
  };

  const unselectMedia = () => {
    selectedMedia?.classList.remove("rich-media-selected");
    selectedMedia = null;
    if (mediaTools) mediaTools.hidden = true;
    refreshPreview();
  };

  const prepareEditorMedia = (root = editor) => {
    root?.querySelectorAll?.("img,video").forEach((media) => {
      media.draggable = true;
      media.contentEditable = "false";
      media.tabIndex = 0;
      if (media.dataset.richMediaBound === "1") return;
      media.dataset.richMediaBound = "1";
      media.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectMedia(media);
      });
      media.addEventListener("dragstart", (event) => {
        selectMedia(media);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", "teacher-site-rich-media");
      });
    });
  };

  const applyMediaSize = () => {
    if (!selectedMedia) {
      setStatus("请先选中图片或视频。", true);
      return;
    }
    const minW = readSizeInput(mediaMinWidth);
    const minH = readSizeInput(mediaMinHeight);
    let width = readSizeInput(mediaWidth);
    let height = readSizeInput(mediaHeight);
    if (width.invalid || height.invalid || minW.invalid || minH.invalid) {
      setStatus("尺寸格式请填写纯数字、px 或 %，例如 320、320px、60%。", true);
      return;
    }
    if (mediaRatio?.checked && selectedMediaRatio) {
      if (document.activeElement === mediaHeight && height.number && height.unit === "px") {
        const number = Math.round(height.number * selectedMediaRatio);
        width = { css: `${number}px`, number, unit: "px" };
      } else if (width.number && width.unit === "px") {
        const number = Math.round(width.number / selectedMediaRatio);
        height = { css: `${number}px`, number, unit: "px" };
      } else if (width.unit === "%") {
        height = { css: "", number: 0, unit: "" };
      }
    }
    selectedMedia.style.minWidth = minW.css;
    selectedMedia.style.minHeight = minH.css;
    selectedMedia.style.width = width.css;
    selectedMedia.style.height = height.css;
    selectedMedia.style.objectFit = width.css && height.css ? "contain" : "";
    if (mediaWidth) mediaWidth.value = width.css;
    if (mediaHeight) mediaHeight.value = height.css;
    refreshPreview();
    setStatus("已应用媒体尺寸。");
  };

  const applyMediaFloat = (mode) => {
    const target = selectedMedia || currentImage();
    if (!target) {
      setStatus("请先在编辑区选中一张图片或视频。", true);
      return;
    }
    selectMedia(target);
    target.style.display = "";
    if (mode === "none") {
      target.style.float = "";
      target.style.margin = "";
      target.style.display = "";
      target.style.maxWidth = "";
    } else if (mode === "center") {
      target.style.float = "";
      target.style.display = "block";
      target.style.margin = "8px auto";
      target.style.maxWidth = "";
    } else {
      target.style.float = mode;
      target.style.margin = mode === "left" ? "4px 14px 8px 0" : "4px 0 8px 14px";
      target.style.maxWidth = target.style.width ? "100%" : "45%";
    }
    refreshPreview();
    setStatus("已调整媒体悬浮方式。");
  };

  const MEDIA_STICK_CLASSES = ["rich-media-sticky", "rich-media-fixed", "rich-media-rail", "is-rich-media-fixed-active"];

  const isEmptyMediaWrapper = (node) => {
    if (!node || node === editor) return false;
    const clone = node.cloneNode(true);
    clone.querySelectorAll("img,video").forEach((item) => item.remove());
    return !clone.textContent.trim() && !clone.querySelector("a,table,ul,ol,pre,blockquote");
  };

  const promoteMediaToEditorRoot = (media) => {
    if (!media || !editor?.contains(media) || media.parentElement === editor) return media;
    let topLevel = media;
    while (topLevel.parentElement && topLevel.parentElement !== editor) topLevel = topLevel.parentElement;
    const oldParent = media.parentElement;
    topLevel.after(media);
    if (isEmptyMediaWrapper(oldParent)) oldParent.remove();
    if (topLevel.isConnected && isEmptyMediaWrapper(topLevel)) topLevel.remove();
    return media;
  };

  const applyMediaStickMode = (mode) => {
    if (!selectedMedia) {
      setStatus("请先选中图片或视频。", true);
      return;
    }
    MEDIA_STICK_CLASSES.forEach((name) => selectedMedia.classList.remove(name));
    selectedMedia.style.removeProperty("--rich-fixed-left");
    selectedMedia.style.removeProperty("--rich-fixed-width");
    selectedMedia.style.removeProperty("--rich-fixed-height");
    if (mode === "none") {
      refreshPreview();
      setStatus("已取消媒体吸顶。");
      return;
    }
    if (mode === "page") {
      selectedMedia = promoteMediaToEditorRoot(selectedMedia);
      selectMedia(selectedMedia);
      selectedMedia.classList.add("rich-media-sticky");
      saveSelection();
      setStatus("已启用全页吸顶：媒体已提升为编辑区一级元素。");
    } else {
      selectedMedia.classList.add("rich-media-sticky");
      setStatus("已启用区域吸顶：保留当前位置和当前对齐方式。");
    }
    refreshPreview();
  };

  const mediaPreviewUrl = (item) => item.url || (item.object_key || item.key ? `/media/${item.object_key || item.key}` : "");
  const mediaPreviewType = (item) => String(item.mime_type || item.mime || "").toLowerCase();

  const insertMedia = (item) => {
    const url = item.url || mediaPreviewUrl(item);
    if (!url) return;
    const type = mediaPreviewType(item);
    const alt = escapeHtml(item.title || item.object_key || item.key || "media");
    const html = type.startsWith("video/")
      ? `<video controls src="${escapeHtml(url)}"></video>`
      : type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(url)
        ? `<img src="${escapeHtml(url)}" alt="${alt}">`
        : `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${alt}</a>`;
    restoreSelection();
    document.execCommand("insertHTML", false, html);
    prepareEditorMedia();
    const mediaItems = Array.from(editor.querySelectorAll("img,video"));
    if (mediaItems.length) selectMedia(mediaItems[mediaItems.length - 1]);
    saveSelection();
    refreshPreview();
    if (mediaDialog) mediaDialog.hidden = true;
    setStatus(`已插入媒体：${item.object_key || item.key || item.title || "媒体文件"}`);
  };

  const renderMediaList = (items) => {
    if (!mediaList) return;
    if (!items.length) {
      mediaList.innerHTML = `<p class="admin-muted">没有找到可用媒体。</p>`;
      return;
    }
    mediaList.innerHTML = items.map((item, index) => {
      const url = mediaPreviewUrl(item);
      const mime = mediaPreviewType(item);
      const title = escapeHtml(item.title || item.object_key || "未命名媒体");
      const key = escapeHtml(item.object_key || item.key || "");
      const thumb = mime.startsWith("video/")
        ? `<video class="rich-media-thumb-media" src="${escapeHtml(url)}" muted></video>`
        : (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(url))
          ? `<img class="rich-media-thumb-media" src="${escapeHtml(url)}" alt="">`
          : `<span class="rich-media-file-badge">${escapeHtml((mime || "file").split("/").pop() || "file")}</span>`;
      return `<button class="rich-media-item" type="button" data-media-index="${index}">
        <span class="rich-media-thumb">${thumb}</span>
        <span class="rich-media-meta"><strong>${title}</strong><span>${key}</span></span>
      </button>`;
    }).join("");
    mediaList.querySelectorAll("[data-media-index]").forEach((button) => {
      button.addEventListener("click", () => insertMedia(items[Number(button.dataset.mediaIndex)]));
    });
  };

  const loadMedia = async (query = "") => {
    if (mediaStatus) mediaStatus.textContent = "正在读取媒体库...";
    try {
      const url = `/api/admin/media/options?q=${encodeURIComponent(query)}&page=1&per_page=80`;
      const data = await fetch(url, { headers: { Accept: "application/json" } }).then((response) => response.json());
      const items = data.items || data.rows || [];
      renderMediaList(items);
      if (mediaStatus) mediaStatus.textContent = data.has_more ? `已显示前 ${items.length} 个媒体，可继续搜索缩小范围。` : `已读取 ${items.length} 个可用媒体。`;
    } catch (error) {
      renderMediaList([]);
      if (mediaStatus) mediaStatus.textContent = `读取媒体库失败：${error.message || error}`;
    }
  };

  const safeMediaName = (name) => {
    const raw = String(name || "news-media.bin").replace(/\\/g, "/").split("/").pop();
    const dot = raw.lastIndexOf(".");
    const stem = (dot > 0 ? raw.slice(0, dot) : raw).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "news-media";
    const suffix = dot > 0 ? raw.slice(dot).toLowerCase() : ".bin";
    return `${stem.slice(0, 54)}-${Date.now()}${suffix}`;
  };

  const uploadMedia = async (file) => {
    if (!file) throw new Error("请先选择要上传的媒体文件。");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("文件超过 10MB，请压缩后再上传。");
    const form = new FormData();
    form.append("file", file);
    form.append("folder", "news");
    form.append("title", file.name || "news-media");
    form.append("file_name", safeMediaName(file.name));
    const response = await fetch("/api/admin/media/upload", { method: "POST", body: form, credentials: "same-origin" });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : { ok: false, message: await response.text() };
    if (!response.ok) throw new Error(data.message || `上传失败：HTTP ${response.status}`);
    if (!data.ok) throw new Error(data.message || "上传失败");
    return { ...(data.item || {}), key: data.key, object_key: data.key, url: data.url, title: (data.item || {}).title || file.name, mime_type: file.type };
  };

  const uploadAndInsert = async (file) => {
    try {
      if (!file) throw new Error("请先选择要上传的媒体文件。");
      const uploadLabel = `${file.name || "粘贴媒体"}（${formatBytes(file.size)}）`;
      if (mediaStatus) mediaStatus.textContent = `正在上传：${uploadLabel}`;
      setStatus(`正在上传：${uploadLabel}`);
      const item = await uploadMedia(file);
      insertMedia(item);
      if (mediaStatus) mediaStatus.textContent = `上传完成并已插入：${item.object_key || item.key || file.name}`;
    } catch (error) {
      const message = error.message || String(error);
      if (mediaStatus) mediaStatus.textContent = message;
      setStatus(message, true);
    }
  };

  const bindControls = () => {
    document.querySelectorAll("[data-rich-cmd]").forEach((button) => {
      button.addEventListener("click", () => runCommand(button.dataset.richCmd));
    });
    $("[data-rich-block]")?.addEventListener("change", (event) => runCommand("formatBlock", event.target.value));
    $("[data-rich-font]")?.addEventListener("change", (event) => {
      if (event.target.value) runCommand("fontName", event.target.value);
    });
    $("[data-rich-size]")?.addEventListener("change", (event) => {
      if (event.target.value) runCommand("fontSize", event.target.value);
    });
    $("[data-rich-color]")?.addEventListener("input", (event) => runCommand("foreColor", event.target.value));
    $("[data-rich-bg]")?.addEventListener("input", (event) => runCommand("hiliteColor", event.target.value));
    $("[data-rich-link]")?.addEventListener("click", () => {
      const href = window.prompt("请输入链接地址");
      if (href) runCommand("createLink", href);
    });
    $("[data-rich-clear]")?.addEventListener("click", () => runCommand("removeFormat"));
    document.querySelectorAll("[data-rich-float]").forEach((button) => {
      button.addEventListener("click", () => applyMediaFloat(button.dataset.richFloat));
    });
    $("[data-media-unselect]")?.addEventListener("click", unselectMedia);
    $("[data-media-size-apply]")?.addEventListener("click", applyMediaSize);
    mediaWidth?.addEventListener("input", () => {
      if (!mediaRatio?.checked || !selectedMediaRatio || document.activeElement !== mediaWidth) return;
      const width = readSizeInput(mediaWidth);
      if (width.unit === "%" && mediaHeight) {
        mediaHeight.value = "";
      } else if (width.number && width.unit === "px" && mediaHeight) {
        mediaHeight.value = `${Math.round(width.number / selectedMediaRatio)}px`;
      }
    });
    mediaHeight?.addEventListener("input", () => {
      if (!mediaRatio?.checked || !selectedMediaRatio || document.activeElement !== mediaHeight) return;
      const height = readSizeInput(mediaHeight);
      if (height.number && height.unit === "px" && mediaWidth) {
        mediaWidth.value = `${Math.round(height.number * selectedMediaRatio)}px`;
      }
    });
    document.querySelectorAll("[data-media-align]").forEach((button) => {
      button.addEventListener("click", () => applyMediaFloat(button.dataset.mediaAlign));
    });
    document.querySelectorAll("[data-media-stick-mode]").forEach((button) => {
      button.addEventListener("click", () => applyMediaStickMode(button.dataset.mediaStickMode || "sticky"));
    });
    $("[data-rich-media]")?.addEventListener("click", () => {
      saveSelection();
      mediaDialog.hidden = false;
      loadMedia();
      mediaSearch?.querySelector("input")?.focus();
    });
    $("[data-window-refresh]")?.addEventListener("click", loadFromOpener);
    $("[data-window-apply]")?.addEventListener("click", applyToOpener);
    $("[data-window-close]")?.addEventListener("click", () => window.close());
    $("[data-media-close]")?.addEventListener("click", () => {
      mediaDialog.hidden = true;
      restoreSelection();
    });
    mediaDialog?.addEventListener("click", (event) => {
      if (event.target === mediaDialog) {
        mediaDialog.hidden = true;
        restoreSelection();
      }
    });
    mediaSearch?.addEventListener("submit", (event) => {
      event.preventDefault();
      loadMedia(new FormData(mediaSearch).get("q") || "");
    });
    $("[data-media-upload]")?.addEventListener("click", () => uploadAndInsert(mediaFile?.files?.[0]));
    mediaFile?.addEventListener("change", () => {
      const file = mediaFile.files?.[0];
      if (mediaStatus) mediaStatus.textContent = file ? `已选择：${file.name}（${formatBytes(file.size)}）` : "";
    });
    editor?.addEventListener("keyup", () => {
      saveSelection();
      refreshPreview();
    });
    editor?.addEventListener("mouseup", saveSelection);
    editor?.addEventListener("click", (event) => {
      const media = event.target.closest?.("img,video");
      if (media && editor.contains(media)) {
        selectMedia(media);
        return;
      }
      if (!event.target.closest?.("[data-media-tools]")) unselectMedia();
    });
    editor?.addEventListener("dragover", (event) => {
      if (!selectedMedia) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    editor?.addEventListener("drop", (event) => {
      if (!selectedMedia) return;
      event.preventDefault();
      const range = document.caretRangeFromPoint
        ? document.caretRangeFromPoint(event.clientX, event.clientY)
        : document.caretPositionFromPoint
          ? (() => {
              const position = document.caretPositionFromPoint(event.clientX, event.clientY);
              if (!position) return null;
              const item = document.createRange();
              item.setStart(position.offsetNode, position.offset);
              item.collapse(true);
              return item;
            })()
          : null;
      if (range && editor.contains(range.startContainer) && !selectedMedia.contains(range.startContainer)) {
        range.insertNode(selectedMedia);
        selectMedia(selectedMedia);
        refreshPreview();
        setStatus("已移动媒体位置。");
      }
    });
    editor?.addEventListener("blur", saveSelection);
    editor?.addEventListener("input", refreshPreview);
    editor?.addEventListener("paste", (event) => {
      const files = Array.from(event.clipboardData?.files || []).filter((file) => /^(image|video)\//.test(file.type));
      if (!files.length) return;
      event.preventDefault();
      files.forEach((file) => uploadAndInsert(file));
    });
  };

  bindControls();
  loadFromOpener();
  if (new URLSearchParams(window.location.search).get("mode") !== "preview") {
    editor?.focus();
    saveSelection();
  }
})();
