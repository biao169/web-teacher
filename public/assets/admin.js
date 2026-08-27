(() => {
  const selectAll = document.getElementById("select-all-citations");
  const citationChecks = () => Array.from(document.querySelectorAll(".copy-check"));
  const citationStyleControl = document.getElementById("citation-style");
  const citationStyle = () => citationStyleControl?.value || "gbt";
  const citationText = (item) => item.dataset[citationStyle()] || item.dataset.gbt || "";
  const citationEscapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const citationEscapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const renderHighlightedText = (text, termsRaw) => {
    const source = String(text || "");
    const terms = String(termsRaw || "").split(/[;；\n]+/).map((item) => item.trim()).filter((item, index, array) => item.length >= 2 && array.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index).sort((a, b) => b.length - a.length);
    if (!source || !terms.length) return citationEscapeHtml(source);
    const pattern = new RegExp(terms.map(citationEscapeRegex).join("|"), "gi");
    let last = 0;
    let html = "";
    source.replace(pattern, (match, offset) => {
      html += citationEscapeHtml(source.slice(last, offset));
      html += `<strong class="pub-author-highlight">${citationEscapeHtml(match)}</strong>`;
      last = offset + match.length;
      return match;
    });
    return (html + citationEscapeHtml(source.slice(last))).replace(/<\/strong>\*/g, "</strong><sup class=\"pub-corresponding-marker\" title=\"通讯作者\">*</sup>");
  };
  const citationHighlightTerms = (item, style) => item.dataset[`highlight${style.charAt(0).toUpperCase()}${style.slice(1)}`] || "";
  const citationHtml = (item) => renderHighlightedText(citationText(item), citationHighlightTerms(item, citationStyle()));
  const refreshVisibleCitations = () => {
    document.querySelectorAll(".pub-citation").forEach((item) => {
      item.innerHTML = citationHtml(item);
    });
  };
  if (citationStyleControl) {
    citationStyleControl.addEventListener("change", refreshVisibleCitations);
    refreshVisibleCitations();
  }
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      citationChecks().forEach((item) => {
        item.checked = selectAll.checked;
      });
    });
    citationChecks().forEach((item) => {
      item.addEventListener("change", () => {
        const checks = citationChecks();
        selectAll.checked = checks.length > 0 && checks.every((check) => check.checked);
      });
    });
  }

  const copySelected = document.getElementById("copy-selected");
  if (copySelected) {
    copySelected.addEventListener("click", async () => {
      const checks = citationChecks().filter((item) => item.checked);
      const text = checks.map(citationText).filter(Boolean).join("\n");
      const status = document.getElementById("copy-status");
      if (!text) {
        if (status) status.textContent = "请先选择论文";
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        if (status) status.textContent = `已复制 ${checks.length} 条`;
      } catch {
        if (status) status.textContent = "复制失败";
      }
    });
  }

  document.querySelectorAll(".citation-copy-one").forEach((button) => {
    button.addEventListener("click", async () => {
      const status = document.getElementById("copy-status");
      const text = citationText(button);
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        if (status) status.textContent = "已复制 1 条";
      } catch {
        if (status) status.textContent = "复制失败";
      }
    });
  });

  document.querySelectorAll(".contact-icon-img").forEach((icon) => {
    const parent = icon.closest(".contact-icon");
    const markMissing = () => {
      if (parent) parent.classList.add("icon-missing");
    };
    icon.addEventListener("error", markMissing);
    if (icon.complete && icon.naturalWidth === 0) markMissing();
  });

  document.querySelectorAll("img[data-avatar-label]").forEach((img) => {
    const replaceMissingAvatar = () => {
      const fallback = document.createElement("div");
      const classes = [img.className, "avatar-fallback"];
      if (img.dataset.avatarCjk === "1") classes.push("avatar-fallback-cjk");
      if (img.dataset.avatarLong === "1") classes.push("avatar-fallback-long");
      fallback.className = classes.join(" ");
      fallback.setAttribute("aria-label", img.getAttribute("alt") || "无照片");
      fallback.textContent = img.dataset.avatarLabel || img.getAttribute("alt") || "?";
      img.replaceWith(fallback);
    };
    img.addEventListener("error", replaceMissingAvatar, { once: true });
    if (img.complete && img.naturalWidth === 0) replaceMissingAvatar();
  });

  const mediaSelectAll = document.getElementById("admin-media-select-all");
  const mediaBatchForm = document.getElementById("media-batch-form");
  const mediaChecks = () => Array.from(document.querySelectorAll(".media-select input[name='selected']"));
  const mediaCount = document.getElementById("admin-media-selected-count");
  const refreshMediaCount = () => {
    const checks = mediaChecks();
    const selected = checks.filter((item) => item.checked).length;
    if (mediaCount) mediaCount.textContent = `已选 ${selected} 个`;
    if (mediaSelectAll) {
      mediaSelectAll.checked = checks.length > 0 && selected === checks.length;
      mediaSelectAll.indeterminate = selected > 0 && selected < checks.length;
    }
  };
  if (mediaSelectAll) {
    mediaSelectAll.addEventListener("change", () => {
      mediaChecks().forEach((item) => {
        item.checked = mediaSelectAll.checked;
      });
      refreshMediaCount();
    });
    mediaChecks().forEach((item) => item.addEventListener("change", refreshMediaCount));
    refreshMediaCount();
  }
  if (mediaBatchForm) {
    mediaBatchForm.addEventListener("submit", (event) => {
      const selected = mediaChecks().filter((item) => item.checked).length;
      const action = mediaBatchForm.querySelector("[name='batch_action']")?.value || "update";
      if (!selected) {
        event.preventDefault();
        if (mediaCount) mediaCount.textContent = "请先选择媒体";
        return;
      }
      const submitterAction = event.submitter?.getAttribute?.("formaction") || "";
      const isExportSubmit = submitterAction.includes("/export-used");
      if (isExportSubmit) {
        delete mediaBatchForm.dataset.confirm;
        return;
      }
      if (action === "delete") {
        const scope = mediaBatchForm.dataset.deleteScope || "媒体文件和媒体库记录";
        mediaBatchForm.dataset.confirm = `确定彻底删除选中的 ${selected} 个${scope}吗？`;
      } else {
        delete mediaBatchForm.dataset.confirm;
      }
    });
  }

  document.querySelectorAll(".admin-batch-toolbar[data-batch-table]").forEach((form) => {
    const table = form.dataset.batchTable;
    if (!table) return;
    const checks = () => Array.from(document.querySelectorAll(`input[data-batch-table="${table}"][name="selected"]`));
    const selectAll = form.querySelector("[data-batch-select-all]");
    const count = form.querySelector("[data-batch-count]");
    const refreshCount = () => {
      const items = checks();
      const selected = items.filter((item) => item.checked).length;
      if (count) count.textContent = `已选 ${selected} 条`;
      if (selectAll) {
        selectAll.checked = items.length > 0 && selected === items.length;
        selectAll.indeterminate = selected > 0 && selected < items.length;
      }
    };
    if (selectAll) {
      selectAll.addEventListener("change", () => {
        checks().forEach((item) => {
          item.checked = selectAll.checked;
        });
        refreshCount();
      });
    }
    checks().forEach((item) => item.addEventListener("change", refreshCount));
    form.addEventListener("submit", (event) => {
      const selected = checks().filter((item) => item.checked).length;
      if (!selected) {
        event.preventDefault();
        if (count) count.textContent = "请先选择记录";
      }
    });
    refreshCount();
  });

  const translationSelectAll = document.getElementById("translation-select-all");
  const translationAutoForm = document.getElementById("translation-auto-form");
  const translationChecks = () => Array.from(document.querySelectorAll(".translation-select-cell input[name='selected']"));
  const translationCount = document.getElementById("translation-selected-count");
  const translationProgress = document.getElementById("translation-progress");
  const translationProgressText = document.getElementById("translation-progress-text");
  const translationProgressBar = document.getElementById("translation-progress-bar");
  const translationProgressSources = document.getElementById("translation-progress-sources");
  const translationProgressNote = document.getElementById("translation-progress-note");
  const translationProgressStop = document.getElementById("translation-progress-stop");
  const translationProviderSummary = document.getElementById("translation-provider-summary");
  const translationProgressStateKey = "teacherSite.translationProgress.v1";
  let translationJobRunning = false;
  let translationJobStopped = false;
  let translationProgressState = null;
  let translationActiveJobId = "";
  const refreshTranslationCount = () => {
    const checks = translationChecks();
    const selected = checks.filter((item) => item.checked).length;
    if (translationCount) {
      translationCount.textContent = selected ? `已选 ${selected} 条` : "未选=按范围";
    }
    if (translationSelectAll) {
      translationSelectAll.checked = checks.length > 0 && selected === checks.length;
      translationSelectAll.indeterminate = selected > 0 && selected < checks.length;
    }
  };
  if (translationSelectAll) {
    translationSelectAll.addEventListener("change", () => {
      translationChecks().forEach((item) => {
        item.checked = translationSelectAll.checked;
      });
      refreshTranslationCount();
    });
    translationChecks().forEach((item) => item.addEventListener("change", refreshTranslationCount));
    refreshTranslationCount();
  }
  const writeTranslationProgressState = (patch = {}) => {
    translationProgressState = { ...(translationProgressState || {}), ...patch, updatedAt: Date.now() };
    try {
      window.localStorage?.setItem(translationProgressStateKey, JSON.stringify(translationProgressState));
    } catch {
      // localStorage can be unavailable in restricted browser modes.
    }
  };
  const readTranslationProgressState = () => {
    try {
      const raw = window.localStorage?.getItem(translationProgressStateKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const selectedProviderLabel = () => {
    const option = translationAutoForm?.querySelector("[name='provider'] option:checked");
    return option?.textContent?.trim() || translationAutoForm?.querySelector("[name='provider']")?.value || "自动选择";
  };
  const selectedScopeLabel = () => {
    const option = translationAutoForm?.querySelector("[name='scope'] option:checked");
    return option?.textContent?.trim() || translationAutoForm?.querySelector("[name='scope']")?.value || "待填写优先";
  };
  const providerSummaryText = () => translationProviderSummary?.textContent?.replace(/\s+/g, " ").trim() || "";
  const translationActiveSourceText = (state) => {
    if (state?.active_provider_summary) return state.active_provider_summary;
    if (state?.last_step_provider_summary) return state.last_step_provider_summary;
    if (state?.providerSummary) return state.providerSummary;
    if (state?.activeProviderSummary) return state.activeProviderSummary;
    return "";
  };
  const translationStateNote = (state, fallback = "") => {
    const source = state?.available_provider_summary ? `可用源：${state.available_provider_summary}` : state?.providerSummary ? `可用源：${state.providerSummary}` : providerSummaryText();
    const scope = state?.scope_label ? `范围：${state.scope_label}` : selectedScopeLabel() ? `范围：${selectedScopeLabel()}` : "";
    const totals = state ? `成功 ${Number(state.translated_total || 0)} 条，失败 ${Number(state.failed_total || 0)} 条` : "";
    return [fallback || state?.message || "", totals, source, scope].filter(Boolean).join("；");
  };
  const translationStatusLabel = (status) => {
    const labels = { cached: "已缓存", success: "已缓存", reviewed: "已缓存", unconfirmed: "未确认", pending: "待填写", failed: "失败", stale: "原文已变", dedicated: "专属英文", missing: "缺缓存" };
    return labels[status] || status || "未知";
  };
  const setTranslationProgress = (text, done = 0, total = 0, note = "", persist = true, activeSourceText = "") => {
    if (translationProgress) translationProgress.hidden = false;
    if (translationProgressText) translationProgressText.textContent = text;
    const currentSourceText = activeSourceText || translationProgressState?.activeProviderSummary || "";
    if (translationProgressSources) {
      translationProgressSources.textContent = currentSourceText ? `当前使用源：${currentSourceText}` : "";
      translationProgressSources.hidden = !currentSourceText;
    }
    if (translationProgressBar) {
      translationProgressBar.max = Math.max(1, Number(total || 0));
      translationProgressBar.value = Math.max(0, Math.min(Number(done || 0), Number(translationProgressBar.max || 1)));
    }
    if (translationProgressNote && note) translationProgressNote.textContent = note;
    if (persist) {
      writeTranslationProgressState({ text, done, total, note, providerLabel: selectedProviderLabel(), scopeLabel: selectedScopeLabel(), providerSummary: providerSummaryText(), activeProviderSummary: currentSourceText });
    }
  };
  const restoreTranslationProgress = () => {
    const state = readTranslationProgressState();
    if (!state || !state.updatedAt) return;
    const maxAge = 24 * 60 * 60 * 1000;
    if (Date.now() - Number(state.updatedAt || 0) > maxAge) return;
    translationProgressState = state;
    const source = state.providerSummary ? `可用源：${state.providerSummary}` : state.providerLabel ? `翻译源：${state.providerLabel}` : "";
    const note = [state.note, source, state.scopeLabel ? `范围：${state.scopeLabel}` : ""].filter(Boolean).join("；");
    setTranslationProgress(state.text || "上次自动翻译进度", Number(state.done || 0), Number(state.total || 1), note, false, state.activeProviderSummary || "");
  };
  const applyTranslationState = (state, persist = true) => {
    if (!state) return;
    const status = state.status || "idle";
    const done = Number(state.done ?? state.done_count ?? 0);
    const total = Number(state.total || 0);
    const label = status === "running" ? `运行中 ${done}/${total || 1}` : status === "completed" ? `完成 ${done}/${total || done || 1}` : status === "stopped" ? `已停止 ${done}/${total || done || 1}` : state.message || "自动翻译状态";
    const activeSourceText = translationActiveSourceText(state);
    setTranslationProgress(label, done, total || done || 1, translationStateNote(state), persist, activeSourceText);
    writeTranslationProgressState({
      running: status === "running",
      stopped: status === "stopped",
      done,
      total: total || done || 1,
      translatedTotal: Number(state.translated_total || 0),
      failedTotal: Number(state.failed_total || 0),
      processed: state.processed || [],
      providerLabel: state.provider_label || selectedProviderLabel(),
      scopeLabel: state.scope_label || selectedScopeLabel(),
      providerSummary: state.available_provider_summary || providerSummaryText(),
      activeProviderSummary: activeSourceText,
      jobId: state.job_id || "",
    });
  };
  const updateTranslationRows = (items = []) => {
    items.forEach((item) => {
      if (!item?.uid) return;
      const selector = `.translation-select-cell input[name='selected'][value="${CSS.escape(item.uid)}"]`;
      const row = document.querySelector(selector)?.closest(".translation-admin-row");
      if (!row) return;
      if (item.translated_text !== undefined) {
        const textarea = row.querySelector(".translation-inline-form textarea[name='translated_text']");
        if (textarea) {
          textarea.value = item.translated_text || "";
          textarea.title = item.translated_text || "";
        }
      }
      const status = item.display_status || item.status || "";
      if (status) {
        row.className = row.className.replace(/\bstatus-\S+/g, "").trim();
        row.classList.add("translation-admin-row", `status-${status}`);
        const badge = row.querySelector(".translation-status-badge");
        if (badge) {
          badge.className = `translation-status-badge translation-status-${status}`;
          badge.textContent = translationStatusLabel(status);
        }
      }
      const confirmButton = row.querySelector(".translation-confirm-toggle");
      if (confirmButton && item.action_value && item.action_label) {
        confirmButton.value = item.action_value;
        confirmButton.textContent = item.action_label;
      }
    });
  };
  document.querySelectorAll(".translation-actions-cell button[form][name='_translation_action']").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const formId = button.getAttribute("form");
      const form = formId ? document.getElementById(formId) : null;
      if (!form) return;
      event.preventDefault();
      const row = button.closest(".translation-admin-row");
      const params = new URLSearchParams(new FormData(form));
      params.set(button.name, button.value);
      button.disabled = true;
      const oldText = button.textContent;
      button.textContent = button.value === "save" ? "保存中" : "处理中";
      try {
        const payload = await fetch("/api/admin/translation/inline", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: params.toString(),
        }).then((item) => item.json());
        if (payload.ok) {
          updateTranslationRows([payload]);
          if (button.value === "save") button.textContent = "已保存";
          setTimeout(() => {
            if (button.value === "save") button.textContent = "保存";
          }, 900);
        } else {
          button.textContent = oldText;
        }
      } catch {
        button.textContent = oldText;
        if (row) row.classList.add("status-failed");
      } finally {
        button.disabled = false;
      }
    });
  });
  const translationDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const translationSubmitButton = () => translationAutoForm?.querySelector("button[type='submit']");
  const runTranslationJob = async (initialState) => {
    const jobId = initialState?.job_id;
    if (!jobId) return;
    translationActiveJobId = jobId;
    translationJobRunning = true;
    translationJobStopped = false;
    const submitButton = translationSubmitButton();
    if (submitButton) submitButton.disabled = true;
    let currentState = initialState;
    try {
      while (!translationJobStopped && translationActiveJobId === jobId && currentState?.status === "running") {
        const done = Number(currentState.done || 0);
        const total = Number(currentState.total || 0);
        setTranslationProgress(
          total ? `正在处理 ${Math.min(done + 1, total)}/${total}` : "正在检查待翻译缓存",
          done,
          total || 1,
          translationStateNote(currentState, "刷新页面后已恢复自动翻译任务。"),
          true,
          translationActiveSourceText(currentState)
        );
        const params = new URLSearchParams();
        params.set("job_id", jobId);
        params.set("step_size", "8");
        const payload = await fetch("/api/admin/translation/auto-step", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: params.toString(),
        }).then((item) => item.json());
        updateTranslationRows(payload.items || []);
        currentState = payload.state || payload;
        applyTranslationState(currentState);
        if (!payload.ok || payload.done || currentState.status !== "running") break;
        await translationDelay(120);
      }
    } catch {
      setTranslationProgress("中断", Number(currentState?.done || 0), Number(currentState?.total || 1), "自动翻译请求失败；已完成的缓存已保存，可稍后继续。");
    } finally {
      if (translationActiveJobId === jobId) {
        translationJobRunning = false;
        if (submitButton) submitButton.disabled = false;
      }
    }
  };
  const refreshTranslationJobStatus = async () => {
    if (!translationAutoForm) return;
    try {
      const payload = await fetch("/api/admin/translation/status").then((item) => item.json());
      const state = payload.state || payload;
      if (!state || state.status === "idle") return;
      applyTranslationState(state, false);
      if (state.status === "running") runTranslationJob(state);
    } catch {
      // The local progress cache remains useful if the status endpoint is unavailable.
    }
  };
  if (translationAutoForm) {
    translationAutoForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      refreshTranslationCount();
      if (translationJobRunning) {
        translationJobStopped = true;
        translationActiveJobId = "";
      }
      translationJobStopped = false;
      const submitButton = translationSubmitButton();
      if (submitButton) submitButton.disabled = true;
      const selected = translationChecks().filter((item) => item.checked).map((item) => item.value).filter(Boolean);
      const provider = translationAutoForm.querySelector("[name='provider']")?.value || "auto";
      const scope = translationAutoForm.querySelector("[name='scope']")?.value || "priority";
      setTranslationProgress("正在启动", 0, 1, selected.length ? `将翻译已选 ${selected.length} 条，期间可继续编辑其他内容。` : "未选择缓存，将按当前范围小批量处理。", true, selectedProviderLabel());
      try {
        const params = new URLSearchParams();
        params.set("provider", provider);
        params.set("scope", scope);
        selected.forEach((item) => params.append("selected", item));
        const payload = await fetch("/api/admin/translation/start", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: params.toString(),
        }).then((item) => item.json());
        const state = payload.state || payload;
        applyTranslationState(state);
        if (payload.ok && state.status === "running") {
          runTranslationJob(state);
        } else if (!payload.ok) {
          setTranslationProgress("未执行", 0, 1, payload.message || state.message || "自动翻译未启动。");
        }
      } catch {
        setTranslationProgress("启动失败", 0, 1, "自动翻译启动请求失败；请稍后重试。");
      } finally {
        if (!translationJobRunning && submitButton) submitButton.disabled = false;
      }
    });
  }
  if (translationProgressStop) {
    translationProgressStop.addEventListener("click", async () => {
      translationJobStopped = true;
      setTranslationProgress("正在停止", Number(translationProgressBar?.value || 0), Number(translationProgressBar?.max || 1), "当前小批量请求结束后停止。");
      try {
        const payload = await fetch("/api/admin/translation/stop", {
          method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          }).then((item) => item.json());
        translationActiveJobId = "";
        applyTranslationState(payload.state || payload);
      } catch {
        setTranslationProgress("停止失败", Number(translationProgressBar?.value || 0), Number(translationProgressBar?.max || 1), "停止请求失败；当前小批量请求结束后可再次点击停止。");
      }
    });
  }
  restoreTranslationProgress();
  refreshTranslationJobStatus();

  const mediaRefreshStats = document.getElementById("media-refresh-stats");
  const mediaSizeFields = () => Array.from(document.querySelectorAll(".media-size-value[data-media-key]"));
  const setText = (id, text) => {
    const item = document.getElementById(id);
    if (item) item.textContent = text;
  };
  const mediaStatsCacheKey = "teacherSite.mediaStats.v1";
  const mediaStatsCacheTtl = 5 * 60 * 1000;
  const readMediaStatsCache = () => {
    try {
      const raw = window.localStorage?.getItem(mediaStatsCacheKey);
      const data = raw ? JSON.parse(raw) : null;
      if (!data || !data.time || Date.now() - Number(data.time) > mediaStatsCacheTtl) return null;
      return data;
    } catch {
      return null;
    }
  };
  const writeMediaStatsCache = (data) => {
    try {
      window.localStorage?.setItem(mediaStatsCacheKey, JSON.stringify({ ...data, time: Date.now() }));
    } catch {
      // localStorage can be unavailable in restricted browser modes.
    }
  };
  const applyMediaSummary = (summary) => {
    if (!summary) return;
    setText("media-capacity-count", String(summary.records ?? 0));
    setText("media-capacity-total", summary.recorded_total_label || "待检测");
    if (summary.disk?.available) {
      setText("media-disk-total", `${summary.disk.used_label} / ${summary.disk.total_label}`);
      setText("media-disk-free", `剩余 ${summary.disk.free_label}`);
    } else {
      setText("media-disk-total", "未知");
      setText("media-disk-free", "当前环境不支持磁盘检测");
    }
  };
  const applyMediaStatsCache = () => {
    const cache = readMediaStatsCache();
    if (!cache) return false;
    applyMediaSummary(cache.summary);
    let measuredTotal = 0;
    let measuredCount = 0;
    let missingCount = 0;
    const files = cache.files || {};
    for (const field of mediaSizeFields()) {
      const key = field.dataset.mediaKey || "";
      const data = files[key];
      if (!data) {
        missingCount += 1;
        continue;
      }
      field.textContent = data.label || "未知";
      field.dataset.mediaSize = String(data.size || 0);
      if (data.exists) {
        measuredTotal += Number(data.size || 0);
        measuredCount += 1;
      }
    }
    if (measuredCount) {
      setText("media-capacity-total", formatMediaBytes(measuredTotal));
      setText("media-capacity-note", `使用缓存 ${measuredCount}/${mediaSizeFields().length} 个文件`);
    } else {
      setText("media-capacity-note", "使用缓存，点击刷新检测");
    }
    return missingCount === 0;
  };
  const refreshMediaStats = async (force = false) => {
    if (!mediaRefreshStats) return;
    mediaRefreshStats.disabled = true;
    setText("media-capacity-note", force ? "正在重新检测磁盘" : "正在读取容量缓存");
    const previousCache = readMediaStatsCache();
    const nextCache = { summary: previousCache?.summary || null, files: { ...(previousCache?.files || {}) } };
    try {
      const summaryUrl = force ? "/api/admin/media/summary?refresh=1" : "/api/admin/media/summary";
      const summary = await fetch(summaryUrl, force ? { cache: "no-store" } : undefined).then((item) => item.json());
      nextCache.summary = summary;
      applyMediaSummary(summary);
    } catch {
      setText("media-capacity-note", "容量检测失败");
    }

    let measuredTotal = 0;
    let measuredCount = 0;
    for (const field of mediaSizeFields()) {
      const key = field.dataset.mediaKey || "";
      if (!key) continue;
      field.textContent = "检测中";
      try {
        const url = `/api/admin/media/file-size?key=${encodeURIComponent(key)}${force ? "&refresh=1" : ""}`;
        const data = await fetch(url, force ? { cache: "no-store" } : undefined).then((item) => item.json());
        nextCache.files[key] = data;
        field.textContent = data.label || "未知";
        field.dataset.mediaSize = String(data.size || 0);
        if (data.exists) {
          measuredTotal += Number(data.size || 0);
          measuredCount += 1;
          setText("media-capacity-total", formatMediaBytes(measuredTotal));
          setText("media-capacity-note", `已检测 ${measuredCount}/${mediaSizeFields().length} 个文件`);
        }
      } catch {
        field.textContent = "检测失败";
      }
      await new Promise((resolve) => setTimeout(resolve, 45));
    }
    setText("media-capacity-note", `检测完成 ${measuredCount}/${mediaSizeFields().length} 个文件`);
    writeMediaStatsCache(nextCache);
    mediaRefreshStats.disabled = false;
  };
  const formatMediaBytes = (value) => {
    let size = Number(value || 0);
    if (size <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let unit = units[0];
    for (unit of units) {
      if (size < 1024 || unit === units[units.length - 1]) break;
      size /= 1024;
    }
    return unit === "B" ? `${Math.round(size)} B` : `${size.toFixed(1)} ${unit}`;
  };
  if (mediaRefreshStats) {
    mediaRefreshStats.addEventListener("click", () => refreshMediaStats(true));
    if (!applyMediaStatsCache()) setTimeout(() => refreshMediaStats(false), 80);
  }

  let pickerState = { input: null, purpose: "", image: null, imageName: "", offsetX: 0, offsetY: 0, zoom: 1, dragging: false, lastX: 0, lastY: 0, allowReplace: false, replaceKey: "", replaceUid: "", mediaPage: 1, mediaQuery: "", mediaHasMore: false, folders: [], onSelect: null };
  const mediaPreviewUrl = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^(https?:)?\/\//i.test(text) || text.startsWith("/")) return text;
    return `/media/${text.replace(/^\/+/, "")}`;
  };
  const mediaPreviewType = (value) => {
    const path = String(value || "").split(/[?#]/, 1)[0].toLocaleLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|svg|avif|bmp)$/i.test(path)) return "image";
    if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(path)) return "video";
    return "file";
  };
  const mediaPreviewExtension = (value) => {
    const match = String(value || "").split(/[?#]/, 1)[0].match(/\.([a-z0-9]+)$/i);
    return (match?.[1] || "file").toUpperCase().slice(0, 8);
  };
  const mediaPreviewKind = (value) => {
    if (!String(value || "").trim()) return "未选择";
    const type = mediaPreviewType(value);
    if (type === "image") return "图片预览";
    if (type === "video") return "视频预览";
    return `${mediaPreviewExtension(value)} 文件`;
  };
  const updateMediaInputPreview = (input) => {
    const control = input?.closest?.(".media-input-control");
    const preview = control?.querySelector?.("[data-media-preview]");
    if (!input || !preview) return;
    const value = input.value.trim();
    const link = preview.querySelector("[data-media-preview-link]");
    const key = control.querySelector("[data-media-preview-key]");
    const kind = control.querySelector("[data-media-preview-kind]");
    const thumb = preview.querySelector(".media-field-thumb");
    preview.classList.toggle("is-empty", !value);
    if (key) {
      key.textContent = value || "尚未选择媒体";
      key.title = value || "尚未选择媒体";
    }
    if (kind) kind.textContent = mediaPreviewKind(value);
    if (link) link.href = mediaPreviewUrl(value);
    if (!thumb) return;
    if (!value) {
      thumb.innerHTML = '<span class="media-field-empty">无</span>';
      return;
    }
    const url = mediaPreviewUrl(value);
    const type = mediaPreviewType(value);
    if (type === "image") {
      thumb.innerHTML = `<img src="${escapeHtml(url)}" alt="媒体预览" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;object-position:center center;">`;
    } else if (type === "video") {
      thumb.innerHTML = `<video src="${escapeHtml(url)}" muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:contain;object-position:center center;"></video>`;
    } else {
      thumb.innerHTML = `<span class="media-field-file">${escapeHtml(mediaPreviewExtension(value))}</span>`;
    }
  };
  const setMediaInputValue = (input, value) => {
    if (!input) return;
    input.value = value || "";
    updateMediaInputPreview(input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const handlePickedMedia = (key, url = "") => {
    const cleanKey = key || "";
    const cleanUrl = url || mediaPreviewUrl(cleanKey);
    if (typeof pickerState.onSelect === "function") {
      pickerState.onSelect({ key: cleanKey, url: cleanUrl });
      pickerState.onSelect = null;
      return;
    }
    if (pickerState.input) setMediaInputValue(pickerState.input, cleanKey);
  };
  const picker = () => {
    let node = document.getElementById("media-picker-modal");
    if (node) return node;
    node = document.createElement("div");
    node.id = "media-picker-modal";
    node.className = "media-picker-modal";
    node.innerHTML = `
      <div class="media-picker-panel" role="dialog" aria-modal="true" aria-label="媒体选择工具">
        <header class="media-picker-main-head"><div><strong>媒体选择工具</strong><small>从媒体库选择；仅显示可用媒体，不包含回收站内容。</small></div><button type="button" class="button ghost" data-picker-close>关闭</button></header>
        <nav class="media-picker-tabs">
          <button type="button" data-picker-tab="library">媒体库</button>
          <button type="button" data-picker-tab="upload">本地上传</button>
          <button type="button" data-picker-tab="edit">裁剪编辑</button>
        </nav>
        <section class="media-picker-view" data-picker-view="library">
          <form class="media-picker-search"><input name="q" placeholder="搜索标题、key、分类、MIME"><select name="per_page"><option value="60">每页 60</option><option value="100">每页 100</option><option value="120">每页 120</option></select><button type="submit">搜索</button></form>
          <div class="media-picker-list-head"><span>预览</span><span>媒体文件</span><span>分类 / 类型</span></div>
          <div class="media-picker-list"></div>
          <div class="media-picker-actions"><button type="button" class="button light" data-picker-load-more hidden>加载更多</button><span class="media-picker-count admin-muted"></span><button type="button" class="button secondary" data-picker-use>使用选中媒体</button><button type="button" class="button light" data-picker-edit-selected>编辑选中图片</button></div>
        </section>
        <section class="media-picker-view" data-picker-view="upload" hidden>
          <div class="media-picker-view-head"><strong>上传本地文件</strong><small>上传后写入媒体库，可直接用于当前输入项。</small></div>
          <label>本地文件<input type="file" data-picker-file accept="image/*,.svg,.pdf,.doc,.docx"></label>
          <div class="media-picker-upload-grid">
            <label>标题<input data-picker-upload-title placeholder="自动根据文件名生成"></label>
            <label>保存文件名<input data-picker-upload-name placeholder="自动根据文件名生成"></label>
            <label>保存目录<input data-picker-upload-folder list="media-picker-folder-options" value="icons" placeholder="可选择已有目录，也可输入新目录"><datalist id="media-picker-folder-options"></datalist></label>
          </div>
          <p class="admin-muted media-upload-help">选择文件后会自动填入标题、保存文件名和推荐目录；目录可手动输入，保存时会自动创建。</p>
          <div class="media-picker-actions"><button type="button" class="button secondary" data-picker-upload>上传并使用</button><button type="button" class="button light" data-picker-edit-local>用此图片裁剪</button></div>
        </section>
        <section class="media-picker-view media-picker-editor" data-picker-view="edit" hidden>
          <div class="media-picker-view-head"><strong>裁剪生成新图片</strong><small>拖动画布调整位置，滚动鼠标缩放图片。</small></div>
          <canvas width="420" height="280"></canvas>
          <div class="media-editor-controls">
            <label>比例<select data-crop-aspect><option value="1">1:1 图标</option><option value="free">任意比例</option><option value="1.7778">16:9</option><option value="1.3333">4:3</option><option value="0.75">3:4</option></select></label>
            <label>缩放<input type="range" data-crop-zoom min="0.2" max="4" step="0.05" value="1"></label>
            <label>宽度 px<input type="number" data-crop-width value="256" min="16" max="4096"></label>
            <label>高度 px<input type="number" data-crop-height value="256" min="16" max="4096"></label>
            <label>格式<select data-crop-format><option value="image/png">PNG</option><option value="image/webp">WebP</option><option value="image/jpeg">JPG</option></select></label>
            <label>新文件名<input data-crop-name placeholder="自动生成"></label>
          </div>
          <label class="media-replace-option" data-crop-replace-row hidden><input type="checkbox" data-crop-replace> 替换当前媒体文件</label>
          <p class="admin-muted" data-crop-note>拖动画布调整取景，使用缩放和比例控制框选区域。保存会生成新媒体文件，不覆盖原文件。</p>
          <div class="media-picker-actions"><button type="button" class="button secondary" data-crop-save>保存新图片并使用</button></div>
        </section>
        <p class="media-picker-status admin-muted"></p>
      </div>`;
    document.body.appendChild(node);
    bindPicker(node);
    return node;
  };
  const showPickerView = (name) => {
    const node = picker();
    node.querySelectorAll("[data-picker-view]").forEach((view) => {
      view.hidden = view.dataset.pickerView !== name;
    });
    node.querySelectorAll("[data-picker-tab]").forEach((button) => {
      const active = button.dataset.pickerTab === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  };
  const setPickerStatus = (text) => {
    const item = picker().querySelector(".media-picker-status");
    if (item) item.textContent = text || "";
  };
  const bindPicker = (node) => {
    node.querySelector("[data-picker-close]").addEventListener("click", () => node.classList.remove("is-open"));
    node.querySelectorAll("[data-picker-tab]").forEach((button) => button.addEventListener("click", () => showPickerView(button.dataset.pickerTab)));
    node.querySelector(".media-picker-search").addEventListener("submit", (event) => {
      event.preventDefault();
      loadMediaOptions(new FormData(event.currentTarget).get("q") || "", { reset: true });
    });
    node.querySelector("[data-picker-load-more]").addEventListener("click", () => loadMediaOptions(pickerState.mediaQuery, { append: true }));
    node.querySelector("[data-picker-file]").addEventListener("change", (event) => applyUploadDefaults(event.currentTarget.files?.[0]));
    node.querySelectorAll("[data-picker-upload-title], [data-picker-upload-name], [data-picker-upload-folder]").forEach((field) => {
      field.addEventListener("input", () => { field.dataset.touched = "1"; });
    });
    node.querySelector("[data-picker-use]").addEventListener("click", () => {
      const selected = node.querySelector(".media-picker-item.is-selected");
      if (!selected) return;
      handlePickedMedia(selected.dataset.key || "", selected.dataset.url || "");
      node.classList.remove("is-open");
    });
    node.querySelector("[data-picker-edit-selected]").addEventListener("click", () => {
      const selected = node.querySelector(".media-picker-item.is-selected");
      if (!selected) return;
      loadCropImage(selected.dataset.url || `/media/${selected.dataset.key}`, selected.dataset.key || "icon.png");
    });
    node.querySelector("[data-picker-upload]").addEventListener("click", uploadPickedFile);
    node.querySelector("[data-picker-edit-local]").addEventListener("click", editLocalFile);
    node.querySelector("[data-crop-zoom]").addEventListener("input", (event) => {
      pickerState.zoom = Number(event.target.value || 1);
      drawCropCanvas();
    });
    node.querySelector("[data-crop-aspect]").addEventListener("change", drawCropCanvas);
    node.querySelector("[data-crop-save]").addEventListener("click", saveCroppedImage);
    const canvas = node.querySelector("canvas");
    canvas.addEventListener("mousedown", (event) => {
      pickerState.dragging = true;
      pickerState.lastX = event.offsetX;
      pickerState.lastY = event.offsetY;
    });
    window.addEventListener("mouseup", () => { pickerState.dragging = false; });
    canvas.addEventListener("mousemove", (event) => {
      if (!pickerState.dragging) return;
      pickerState.offsetX += event.offsetX - pickerState.lastX;
      pickerState.offsetY += event.offsetY - pickerState.lastY;
      pickerState.lastX = event.offsetX;
      pickerState.lastY = event.offsetY;
      drawCropCanvas();
    });
    canvas.addEventListener("wheel", (event) => {
      if (!pickerState.image) return;
      event.preventDefault();
      const zoom = node.querySelector("[data-crop-zoom]");
      const next = Math.max(Number(zoom.min || 0.2), Math.min(Number(zoom.max || 4), Number(zoom.value || 1) + (event.deltaY < 0 ? 0.08 : -0.08)));
      zoom.value = String(next.toFixed(2));
      pickerState.zoom = next;
      drawCropCanvas();
    }, { passive: false });
  };
  const readableTitleFromFile = (fileName) => {
    const base = String(fileName || "media").split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
    return base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "media";
  };
  const safeMediaName = (fileName) => {
    const raw = String(fileName || "media.bin").split(/[\\/]/).pop();
    const dot = raw.lastIndexOf(".");
    const ext = dot > -1 ? raw.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "") : ".bin";
    const stem = (dot > -1 ? raw.slice(0, dot) : raw).normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "media";
    return `${stem}${ext && ext.length <= 12 ? ext : ".bin"}`;
  };
  const folderFromValue = (value) => {
    const text = String(value || "").replace(/^\/?media\//, "").replace(/^\/?public\/media\//, "");
    return text.includes("/") ? text.split("/").slice(0, -1).join("/") : "";
  };
  const folderForPurpose = (purpose = "", currentValue = "", file = null) => {
    const existing = folderFromValue(currentValue);
    if (existing) return existing;
    const name = String(file?.name || "").toLowerCase();
    if (/pdf_key|paper|publication/.test(purpose) || /\.pdf$/.test(name)) return "publications";
    if (/avatar|profile/.test(purpose)) return "profile";
    if (/student/.test(purpose)) return "students";
    if (/cover|news/.test(purpose)) return "news";
    if (/certificate|patent/.test(purpose)) return "patents";
    if (/course|syllabus|courseware/.test(purpose)) return "courses";
    if (/attachment|message/.test(purpose)) return "messages";
    if (/logo|favicon|og_image|site/.test(purpose)) return "site";
    if (/icon/.test(purpose)) return "icons";
    return pickerState.folders?.[0] || "icons";
  };
  const updateFolderOptions = (folders) => {
    const clean = Array.from(new Set((folders || []).map((item) => String(item || "").trim()).filter(Boolean)));
    if (clean.length) pickerState.folders = clean;
    const node = picker();
    const datalist = node.querySelector("#media-picker-folder-options");
    if (datalist) {
      datalist.innerHTML = (pickerState.folders || []).map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
    }
    const folder = node.querySelector("[data-picker-upload-folder]");
    if (folder && !folder.value) folder.value = folderForPurpose(pickerState.purpose, pickerState.input?.value || "");
  };
  const applyUploadDefaults = (file) => {
    if (!file) return;
    const node = picker();
    const title = node.querySelector("[data-picker-upload-title]");
    const fileName = node.querySelector("[data-picker-upload-name]");
    const folder = node.querySelector("[data-picker-upload-folder]");
    if (title && !title.dataset.touched) title.value = readableTitleFromFile(file.name);
    if (fileName && !fileName.dataset.touched) fileName.value = safeMediaName(file.name);
    if (folder && !folder.dataset.touched) folder.value = folderForPurpose(pickerState.purpose, pickerState.input?.value || "", file);
    setPickerStatus(`已根据文件名生成：${fileName?.value || file.name}`);
  };
  const loadMediaOptions = async (q = "", options = {}) => {
    const node = picker();
    const reset = Boolean(options.reset);
    const append = Boolean(options.append);
    if (reset) pickerState.mediaPage = 1;
    if (!append) {
      pickerState.mediaPage = reset ? 1 : pickerState.mediaPage || 1;
      pickerState.mediaQuery = String(q || "");
    }
    const page = append ? (pickerState.mediaPage || 1) + 1 : (pickerState.mediaPage || 1);
    const perPage = node.querySelector(".media-picker-search [name='per_page']")?.value || "60";
    setPickerStatus("正在读取媒体库");
    try {
      const data = await fetch(`/api/admin/media/options?q=${encodeURIComponent(pickerState.mediaQuery)}&page=${encodeURIComponent(page)}&per_page=${encodeURIComponent(perPage)}`).then((item) => item.json());
      pickerState.mediaPage = Number(data.page || page);
      pickerState.mediaHasMore = Boolean(data.has_more);
      updateFolderOptions(data.folders || []);
      const list = node.querySelector(".media-picker-list");
      const markup = (data.items || []).map((item) => `
        <button type="button" class="media-picker-item" data-key="${escapeHtml(item.key)}" data-url="${escapeHtml(item.url)}" data-image="${item.is_image ? "1" : "0"}">
          <span class="media-picker-thumb">${item.is_image ? `<img class="media-picker-thumb-media" src="${escapeHtml(item.url)}" alt="">` : `<span class="media-picker-file-badge">FILE</span>`}</span>
          <strong class="media-picker-name" title="${escapeHtml(item.title || item.key)}"><span class="media-picker-title">${escapeHtml(item.title || item.key)}</span><small title="${escapeHtml(item.key)}">${escapeHtml(item.key)}</small></strong>
          <em title="${escapeHtml([item.category, item.mime_type].filter(Boolean).join(" / ") || "未分类")}">${escapeHtml([item.category, item.mime_type].filter(Boolean).join(" / ") || "未分类")}</em>
        </button>`).join("");
      if (append) {
        list.insertAdjacentHTML("beforeend", markup);
      } else {
        list.innerHTML = markup || "<p class='admin-muted'>暂无可用媒体。</p>";
      }
      list.querySelectorAll(".media-picker-item").forEach((button) => {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", () => {
          list.querySelectorAll(".media-picker-item").forEach((item) => item.classList.remove("is-selected"));
          button.classList.add("is-selected");
        });
      });
      const loadMore = node.querySelector("[data-picker-load-more]");
      if (loadMore) loadMore.hidden = !pickerState.mediaHasMore;
      const count = node.querySelector(".media-picker-count");
      const shown = list.querySelectorAll(".media-picker-item").length;
      if (count) count.textContent = `已显示 ${shown}/${Number(data.total || shown)} 个`;
      setPickerStatus(data.total ? `媒体库已更新，共 ${data.total} 个匹配项` : "没有匹配的可用媒体");
    } catch {
      setPickerStatus("媒体库读取失败");
    }
  };
  const uploadPickedFile = async () => {
    const node = picker();
    const file = node.querySelector("[data-picker-file]").files?.[0];
    if (!file) {
      setPickerStatus("请先选择文件");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("title", node.querySelector("[data-picker-upload-title]").value || file.name);
    form.append("file_name", node.querySelector("[data-picker-upload-name]").value || safeMediaName(file.name));
    form.append("folder", node.querySelector("[data-picker-upload-folder]").value || "icons");
    setPickerStatus("正在上传");
    try {
      const data = await fetch("/api/admin/media/upload", { method: "POST", body: form }).then((item) => item.json());
      if (!data.ok) throw new Error(data.message || "上传失败");
      handlePickedMedia(data.key || "", data.url || "");
      setPickerStatus("已上传并写入输入框");
      loadMediaOptions();
    } catch (error) {
      setPickerStatus(error.message || "上传失败");
    }
  };
  const editLocalFile = () => {
    const file = picker().querySelector("[data-picker-file]").files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      setPickerStatus("请选择图片文件后再裁剪");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => loadCropImage(String(reader.result || ""), file.name);
    reader.readAsDataURL(file);
  };
  const configureCropReplace = () => {
    const node = picker();
    const row = node.querySelector("[data-crop-replace-row]");
    const checkbox = node.querySelector("[data-crop-replace]");
    const note = node.querySelector("[data-crop-note]");
    const save = node.querySelector("[data-crop-save]");
    if (row) row.hidden = !pickerState.allowReplace;
    if (checkbox) checkbox.checked = false;
    if (note) note.textContent = pickerState.allowReplace ? "拖动画布调整取景。默认保存为新文件；勾选替换时会覆盖当前媒体文件，并按原扩展名保存。" : "拖动画布调整取景，使用缩放和比例控制框选区域。保存会生成新媒体文件，不覆盖原文件。";
    if (save) save.textContent = pickerState.allowReplace ? "保存图片" : "保存新图片并使用";
  };
  const loadCropImage = (src, name, options = {}) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      pickerState.image = img;
      pickerState.imageName = name || "icon.png";
      pickerState.allowReplace = Boolean(options.allowReplace);
      pickerState.replaceKey = options.replaceKey || "";
      pickerState.replaceUid = options.replaceUid || "";
      pickerState.offsetX = 0;
      pickerState.offsetY = 0;
      pickerState.zoom = 1;
      picker().querySelector("[data-crop-zoom]").value = "1";
      picker().querySelector("[data-crop-name]").value = cropFileName(name);
      configureCropReplace();
      showPickerView("edit");
      drawCropCanvas();
      setPickerStatus("图片已载入，可拖动调整取景");
    };
    img.onerror = () => setPickerStatus("图片载入失败，可能是外部图片不允许跨域裁剪");
    img.src = src;
  };
  const cropFrame = (canvas) => {
    const aspectValue = picker().querySelector("[data-crop-aspect]").value;
    const aspect = aspectValue === "free" ? Number(picker().querySelector("[data-crop-width]").value || 1) / Number(picker().querySelector("[data-crop-height]").value || 1) : Number(aspectValue || 1);
    let width = canvas.width * 0.64;
    let height = width / aspect;
    if (height > canvas.height * 0.76) {
      height = canvas.height * 0.76;
      width = height * aspect;
    }
    return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height };
  };
  const drawCropCanvas = () => {
    const canvas = picker().querySelector("canvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#eef5f1";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!pickerState.image) return;
    const img = pickerState.image;
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * pickerState.zoom;
    const width = img.width * scale;
    const height = img.height * scale;
    const x = (canvas.width - width) / 2 + pickerState.offsetX;
    const y = (canvas.height - height) / 2 + pickerState.offsetY;
    ctx.drawImage(img, x, y, width, height);
    const frame = cropFrame(canvas);
    ctx.fillStyle = "rgba(0,0,0,.38)";
    ctx.fillRect(0, 0, canvas.width, frame.y);
    ctx.fillRect(0, frame.y + frame.height, canvas.width, canvas.height - frame.y - frame.height);
    ctx.fillRect(0, frame.y, frame.x, frame.height);
    ctx.fillRect(frame.x + frame.width, frame.y, canvas.width - frame.x - frame.width, frame.height);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
  };
  const saveCroppedImage = async () => {
    if (!pickerState.image) {
      setPickerStatus("请先载入图片");
      return;
    }
    const display = picker().querySelector("canvas");
    const frame = cropFrame(display);
    const img = pickerState.image;
    const scale = Math.min(display.width / img.width, display.height / img.height) * pickerState.zoom;
    const imageX = (display.width - img.width * scale) / 2 + pickerState.offsetX;
    const imageY = (display.height - img.height * scale) / 2 + pickerState.offsetY;
    const output = document.createElement("canvas");
    output.width = Number(picker().querySelector("[data-crop-width]").value || 256);
    output.height = Number(picker().querySelector("[data-crop-height]").value || 256);
    output.getContext("2d").drawImage(img, (frame.x - imageX) / scale, (frame.y - imageY) / scale, frame.width / scale, frame.height / scale, 0, 0, output.width, output.height);
    const replace = Boolean(pickerState.allowReplace && picker().querySelector("[data-crop-replace]")?.checked);
    const format = replace ? mediaFormatForKey(pickerState.replaceKey) : picker().querySelector("[data-crop-format]").value || "image/png";
    const form = new URLSearchParams();
    form.set("image_data", output.toDataURL(format, 0.92));
    form.set("file_name", picker().querySelector("[data-crop-name]").value || cropFileName(pickerState.imageName));
    form.set("folder", picker().querySelector("[data-picker-upload-folder]").value || "icons");
    form.set("title", form.get("file_name"));
    if (replace) {
      form.set("replace_current", "1");
      form.set("replace_key", pickerState.replaceKey);
      form.set("replace_uid", pickerState.replaceUid);
    }
    setPickerStatus(replace ? "正在替换源文件" : "正在保存裁剪结果");
    try {
      const data = await fetch("/api/admin/media/crop", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: form }).then((item) => item.json());
      if (!data.ok) throw new Error(data.message || "保存失败");
      if (data.key) handlePickedMedia(data.key || "", data.url || "");
      if (replace) refreshMediaEditPreview(data.url || mediaPreviewUrl(pickerState.replaceKey));
      setPickerStatus(replace ? "已替换源文件" : "已保存新图片并写入输入框");
      loadMediaOptions();
    } catch (error) {
      setPickerStatus(error.message || "保存失败");
    }
  };
  const mediaFormatForKey = (key) => {
    const ext = String(key || "").split(/[?#]/, 1)[0].toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "webp") return "image/webp";
    return "image/png";
  };
  const refreshMediaEditPreview = (url) => {
    const preview = document.querySelector(".media-edit-preview");
    if (!preview || !url) return;
    const cleanUrl = `${url.split("#", 1)[0]}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
    preview.href = cleanUrl;
    const media = preview.querySelector("img,video");
    if (media) media.src = cleanUrl;
  };
  const cropFileName = (name) => {
    const base = String(name || "icon").split(/[\\/]/).pop().replace(/\.[^.]+$/, "") || "icon";
    return `${base}-crop.png`;
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  document.querySelectorAll(".media-input-control input").forEach((input) => {
    updateMediaInputPreview(input);
    input.addEventListener("input", () => updateMediaInputPreview(input));
    input.addEventListener("change", () => updateMediaInputPreview(input));
  });
  document.querySelectorAll(".media-edit-current-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.mediaKey || "";
      const url = button.dataset.mediaUrl || mediaPreviewUrl(key);
      const input = document.querySelector(".media-asset-edit-form input[name='object_key']");
      pickerState.input = input || null;
      pickerState.purpose = "media_asset";
      const node = picker();
      const folder = key.includes("/") ? key.split("/").slice(0, -1).join("/") : "icons";
      const folderInput = node.querySelector("[data-picker-upload-folder]");
      if (folderInput) folderInput.value = folder || "icons";
      node.classList.add("is-open");
      loadCropImage(url, key || button.dataset.mediaTitle || "media.png", {
        allowReplace: true,
        replaceKey: key,
        replaceUid: button.dataset.mediaUid || "",
      });
    });
  });
  const publicationForm = document.querySelector(".publication-edit-form");
  const publicationStatus = publicationForm?.querySelector("[data-publication-status]");
  const setPublicationStatus = (text) => {
    if (publicationStatus) publicationStatus.textContent = text || "";
  };
  const publicationFieldResult = (name) => publicationForm?.querySelector(`[data-publication-field-result="${name}"]`);
  const setPublicationFieldResult = (name, html, tone = "info") => {
    const target = publicationFieldResult(name);
    if (!target) return;
    target.className = `publication-field-result publication-field-result-${name} tone-${tone}`;
    target.innerHTML = html || "";
  };
  const publicationField = (name) => publicationForm?.querySelector(`[name="${name}"]`);
  const publicationFormParams = () => {
    const params = new URLSearchParams();
    if (!publicationForm) return params;
    publicationForm.querySelectorAll("input[name], textarea[name], select[name]").forEach((field) => {
      if ((field.type === "checkbox" || field.type === "radio") && !field.checked) return;
      params.set(field.name, field.value || "");
    });
    return params;
  };
  const setPublicationField = (name, value, markOriginal = false) => {
    const field = publicationField(name);
    if (!field || value === undefined || value === null || value === "") return false;
    const next = String(value);
    if (field.value === next) return false;
    if (markOriginal) {
      let note = field.closest("label")?.querySelector(".field-original-value");
      if (!note) {
        note = document.createElement("small");
        note.className = "field-original-value";
        field.closest("label")?.appendChild(note);
      }
      const previous = field.value || "空";
      note.innerHTML = `原内容：${escapeHtml(previous)} <button type="button" data-publication-undo="${escapeHtml(name)}">撤销</button>`;
      note.dataset.originalValue = field.value || "";
    }
    field.value = next;
    return true;
  };
  const applyPublicationFields = (fields, markOriginal = false) => {
    let changed = 0;
    Object.entries(fields || {}).forEach(([name, value]) => {
      if (setPublicationField(name, value, markOriginal)) changed += 1;
    });
    return changed;
  };
  const syncPublicationHighlightWidgets = (fields = {}, baseNames = []) => {
    const hiddenBase = publicationField("_highlight_base_names");
    if (hiddenBase && baseNames.length) hiddenBase.value = baseNames.join("; ");
    ["gbt", "elsevier", "apa", "ieee"].forEach((style) => {
      const value = fields[`highlight_${style}`];
      if (value === undefined || value === null) return;
      const input = publicationForm?.querySelector(`[data-publication-highlight-input="${style}"]`);
      if (input) input.value = String(value);
      const editor = publicationForm?.querySelector(`[data-publication-citation-editor="${style}"]`);
      const auto = editor?.querySelector(".publication-highlight-auto");
      if (auto) auto.textContent = value ? `自动匹配：${value}` : "自动匹配：暂无，可手动填写";
    });
  };
  let publicationSuggestionsPromise = null;
  let publicationSuggestions = {};
  let publicationSuggestMenu = null;
  const ensurePublicationSuggestMenu = () => {
    if (publicationSuggestMenu) return publicationSuggestMenu;
    publicationSuggestMenu = document.createElement("div");
    publicationSuggestMenu.className = "publication-suggest-menu";
    publicationSuggestMenu.hidden = true;
    document.body.appendChild(publicationSuggestMenu);
    return publicationSuggestMenu;
  };
  const loadPublicationSuggestions = async () => {
    if (!publicationSuggestionsPromise) {
      publicationSuggestionsPromise = fetch("/api/admin/publications/suggestions").then((item) => item.json()).then((data) => {
        publicationSuggestions = data.fields || {};
        return publicationSuggestions;
      }).catch(() => {
        publicationSuggestions = {};
        return publicationSuggestions;
      });
    }
    return publicationSuggestionsPromise;
  };
  const publicationCurrentToken = (field) => {
    const cursor = field.selectionStart ?? field.value.length;
    const before = field.value.slice(0, cursor);
    const marker = Math.max(before.lastIndexOf(","), before.lastIndexOf("，"), before.lastIndexOf(";"), before.lastIndexOf("；"), before.lastIndexOf("\n"));
    return before.slice(marker + 1).trim();
  };
  const positionPublicationSuggestMenu = (field) => {
    const menu = ensurePublicationSuggestMenu();
    const rect = field.getBoundingClientRect();
    menu.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.width = `${Math.max(220, rect.width)}px`;
  };
  const insertPublicationSuggestion = (field, value) => {
    if (field.dataset.publicationSuggest === "display_tags") {
      const cursor = field.selectionStart ?? field.value.length;
      const before = field.value.slice(0, cursor);
      const after = field.value.slice(cursor);
      const marker = Math.max(before.lastIndexOf(","), before.lastIndexOf("，"), before.lastIndexOf(";"), before.lastIndexOf("；"), before.lastIndexOf("\n"));
      const prefix = marker >= 0 ? before.slice(0, marker + 1) + (before[marker] === "\n" ? "" : " ") : "";
      const suffix = after && /^[,，;；\n]/.test(after) ? after : after ? `, ${after.trimStart()}` : ", ";
      field.value = `${prefix}${value}${suffix}`;
      field.focus();
      field.selectionStart = field.selectionEnd = (prefix + value).length;
      return;
    }
    field.value = value;
    field.focus();
  };
  const suggestTokenDelimiters = [",", "，", ";", "；", "、", "|", "\n"];
  const suggestTokenPattern = /[,，;；、|\n]/;
  const splitSuggestionTokens = (value) => String(value || "").split(suggestTokenPattern).map((item) => item.trim()).filter(Boolean);
  const currentSuggestionToken = (field) => {
    const cursor = field.selectionStart ?? field.value.length;
    const before = field.value.slice(0, cursor);
    const marker = Math.max(...suggestTokenDelimiters.map((item) => before.lastIndexOf(item)));
    return before.slice(marker + 1).trim();
  };
  const insertDelimitedSuggestion = (field, value) => {
    const cursor = field.selectionStart ?? field.value.length;
    const before = field.value.slice(0, cursor);
    const after = field.value.slice(cursor);
    const marker = Math.max(...suggestTokenDelimiters.map((item) => before.lastIndexOf(item)));
    const prefix = marker >= 0 ? `${before.slice(0, marker + 1)} ` : "";
    const cleanValue = String(value || "").trim();
    const suffix = after && suggestTokenPattern.test(after.charAt(0)) ? after : after.trim() ? `; ${after.trimStart()}` : "";
    field.value = `${prefix}${cleanValue}${suffix}`;
    field.focus();
    const position = (prefix + cleanValue).length;
    field.selectionStart = field.selectionEnd = position;
  };
  const showPublicationSuggestions = async (field) => {
    const fieldName = field.dataset.publicationSuggest;
    if (!fieldName) return;
    const suggestions = await loadPublicationSuggestions();
    const values = suggestions[fieldName] || [];
    const token = fieldName === "display_tags" ? publicationCurrentToken(field) : field.value.trim();
    const lowered = token.toLocaleLowerCase();
    const filtered = values.filter((item) => !lowered || String(item).toLocaleLowerCase().includes(lowered)).slice(0, 12);
    const menu = ensurePublicationSuggestMenu();
    if (!filtered.length) {
      menu.hidden = true;
      return;
    }
    menu.innerHTML = filtered.map((item) => `<button type="button" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("");
    positionPublicationSuggestMenu(field);
    menu.hidden = false;
    menu.querySelectorAll("button").forEach((button) => button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      insertPublicationSuggestion(field, button.dataset.value || "");
      menu.hidden = true;
    }));
  };
  const publicationPlatforms = () => Array.from(document.querySelectorAll(".publication-platforms input[name='metadata_platforms']:checked")).map((item) => item.value).join(",");
  if (publicationForm) {
    publicationForm.querySelectorAll("[data-publication-suggest]").forEach((field) => {
      field.addEventListener("focus", () => showPublicationSuggestions(field));
      field.addEventListener("input", () => showPublicationSuggestions(field));
      field.addEventListener("keydown", (event) => {
        if (event.key === "Escape") ensurePublicationSuggestMenu().hidden = true;
      });
    });
    publicationForm.querySelector("[data-publication-parse]")?.addEventListener("click", async () => {
      const raw = publicationForm.querySelector("[data-publication-parse-source]")?.value || "";
      const format = publicationForm.querySelector("[data-publication-parse-format]")?.value || "auto";
      setPublicationStatus("正在解析引文");
      try {
        const data = await fetch("/api/admin/publications/parse", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: new URLSearchParams({ citation: raw, format }) }).then((item) => item.json());
        const changed = applyPublicationFields(data.fields || {}, false);
        setPublicationStatus(data.message || `已填充 ${changed} 个字段`);
      } catch {
        setPublicationStatus("解析失败");
      }
    });
    publicationForm.querySelectorAll("[data-publication-check-duplicates]").forEach((button) => button.addEventListener("click", async () => {
      const targetName = button.dataset.publicationResultTarget || "title";
      const params = new URLSearchParams({ uid: publicationField("uid")?.value || "", title: publicationField("title")?.value || "", doi: publicationField("doi")?.value || "" });
      setPublicationStatus("正在查重");
      setPublicationFieldResult(targetName, "正在查重", "info");
      try {
        const data = await fetch(`/api/admin/publications/duplicates?${params}`).then((item) => item.json());
        if (!data.matches?.length) {
          setPublicationFieldResult(targetName, "<span>未发现标题或 DOI 重复记录</span>", "ok");
          setPublicationStatus("未发现标题或 DOI 重复记录");
          return;
        }
        const links = data.matches.map((item) => `<a href="${escapeHtml(item.edit_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.uid)}</a><span>${escapeHtml((item.reasons || []).join("、"))}</span>`).join("；");
        setPublicationFieldResult(targetName, `可能重复：${links}`, "warn");
        setPublicationStatus(`发现 ${data.matches.length} 条可能重复记录`);
      } catch {
        setPublicationFieldResult(targetName, "<span>查重失败</span>", "warn");
        setPublicationStatus("查重失败");
      }
    }));
    publicationForm.querySelectorAll("[data-publication-lookup-field]").forEach((button) => button.addEventListener("click", async () => {
      const fieldName = button.dataset.publicationLookupField || "title";
      const targetName = button.dataset.publicationResultTarget || fieldName;
      const params = publicationFormParams();
      params.set("platforms", publicationPlatforms());
      params.set("lookup_field", fieldName);
      params.set("lookup_text", publicationField(fieldName)?.value || "");
      setPublicationStatus("正在联网查验");
      setPublicationFieldResult(targetName, "正在联网查验并准备修正", "info");
      try {
        const data = await fetch("/api/admin/publications/lookup", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: params }).then((item) => item.json());
        const fields = data.fields || {};
        const changed = applyPublicationFields(fields, true);
        if (changed) publicationForm.querySelectorAll("[data-publication-highlight-preview]").forEach((item) => item.click());
        const found = Object.keys(fields).length > 0;
        const messages = (data.results || []).map((item) => `${item.platform}: ${item.message || (item.ok ? "ok" : "no result")}`).join("; ");
        const resultText = changed ? `已修正 ${changed} 个字段` : found ? "已找到论文数据，当前字段已是最新" : "未发现可填充字段";
        setPublicationFieldResult(targetName, resultText, changed || found ? "ok" : "warn");
        setPublicationStatus(`${resultText}${messages ? `。${messages}` : ""}`);
      } catch {
        setPublicationFieldResult(targetName, "联网查验失败", "warn");
        setPublicationStatus("联网查验失败");
      }
    }));
    publicationForm.querySelectorAll("[data-publication-sync-highlights]").forEach((button) => button.addEventListener("click", async () => {
      setPublicationStatus("正在同步首页教师本人标识");
      try {
        const data = await fetch("/api/admin/publications/highlights", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: publicationFormParams() }).then((item) => item.json());
        const fields = data.fields || {};
        const changed = applyPublicationFields(fields, true);
        syncPublicationHighlightWidgets(fields, data.base_names || []);
        publicationForm.querySelectorAll("[data-publication-highlight-preview]").forEach((item) => item.click());
        const names = (data.base_names || []).join("; ");
        setPublicationStatus(data.ok ? `已按首页教师${names ? `（${names}）` : ""}同步本人标识，更新 ${changed} 个字段` : "未找到首页教师英文名，无法同步本人标识");
      } catch {
        setPublicationStatus("同步首页教师失败");
      }
    }));
    publicationForm.querySelectorAll("[data-publication-generate-citations]").forEach((button) => button.addEventListener("click", async () => {
      setPublicationStatus("正在生成引用文本");
      try {
        const data = await fetch("/api/admin/publications/citations", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: publicationFormParams() }).then((item) => item.json());
        const changed = applyPublicationFields(data.fields || {}, true);
        if (changed) publicationForm.querySelectorAll("[data-publication-highlight-preview]").forEach((item) => item.click());
        setPublicationStatus(`已生成 ${changed} 个引用字段`);
      } catch {
        setPublicationStatus("生成引用失败");
      }
    }));
    publicationForm.querySelectorAll("[data-publication-highlight-preview]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const style = button.dataset.publicationHighlightPreview || "gbt";
      const text = publicationForm.querySelector(`[data-publication-citation-text="${style}"]`)?.value || "";
      const terms = publicationForm.querySelector(`[data-publication-highlight-input="${style}"]`)?.value || "";
      const target = publicationForm.querySelector(`[data-publication-highlight-preview-target="${style}"]`);
      if (target) { target.innerHTML = renderHighlightedText(text, terms) || '<span class="admin-muted">没有可预览内容</span>'; target.hidden = false; target.classList.add("is-visible"); }
      setPublicationStatus(`已预览 ${style.toUpperCase()} 高亮效果`);
    }));
    publicationForm.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-publication-undo]");
      if (!button) return;
      const field = publicationField(button.dataset.publicationUndo);
      const note = button.closest(".field-original-value");
      if (field && note) {
        field.value = note.dataset.originalValue || "";
        note.remove();
        setPublicationStatus("已撤销该字段修正");
      }
    });
  }
  const projectForm = document.querySelector(".project-edit-form, .project-admin-card");
  let projectSuggestionsPromise = null;
  let projectSuggestions = {};
  const loadProjectSuggestions = async () => {
    if (!projectSuggestionsPromise) {
      projectSuggestionsPromise = fetch("/api/admin/projects/suggestions").then((item) => item.json()).then((data) => {
        projectSuggestions = data.fields || {};
        return projectSuggestions;
      }).catch(() => {
        projectSuggestions = {};
        return projectSuggestions;
      });
    }
    return projectSuggestionsPromise;
  };
  const projectCurrentToken = (field) => {
    const cursor = field.selectionStart ?? field.value.length;
    const before = field.value.slice(0, cursor);
    const marker = Math.max(before.lastIndexOf(","), before.lastIndexOf("，"), before.lastIndexOf(";"), before.lastIndexOf("；"), before.lastIndexOf("\n"));
    return before.slice(marker + 1).trim();
  };
  const insertProjectSuggestion = (field, value) => {
    if (field.dataset.projectSuggest === "members") {
      const cursor = field.selectionStart ?? field.value.length;
      const before = field.value.slice(0, cursor);
      const after = field.value.slice(cursor);
      const marker = Math.max(before.lastIndexOf(","), before.lastIndexOf("，"), before.lastIndexOf(";"), before.lastIndexOf("；"), before.lastIndexOf("\n"));
      const prefix = marker >= 0 ? before.slice(0, marker + 1) + (before[marker] === "\n" ? "" : " ") : "";
      const suffix = after && /^[,，;；\n]/.test(after) ? after : after ? `, ${after.trimStart()}` : ", ";
      field.value = `${prefix}${value}${suffix}`;
      field.focus();
      field.selectionStart = field.selectionEnd = (prefix + value).length;
      return;
    }
    field.value = value;
    field.focus();
  };
  const showProjectSuggestions = async (field) => {
    const fieldName = field.dataset.projectSuggest;
    if (!fieldName) return;
    const suggestions = await loadProjectSuggestions();
    const values = suggestions[fieldName] || [];
    const token = fieldName === "members" ? projectCurrentToken(field) : field.value.trim();
    const lowered = token.toLocaleLowerCase();
    const filtered = values.filter((item) => !lowered || String(item).toLocaleLowerCase().includes(lowered)).slice(0, 12);
    const menu = ensurePublicationSuggestMenu();
    if (!filtered.length) {
      menu.hidden = true;
      return;
    }
    menu.innerHTML = filtered.map((item) => `<button type="button" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("");
    positionPublicationSuggestMenu(field);
    menu.hidden = false;
    menu.querySelectorAll("button").forEach((button) => button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      insertProjectSuggestion(field, button.dataset.value || "");
      menu.hidden = true;
    }));
  };
  if (projectForm) {
    projectForm.querySelectorAll("[data-project-suggest]").forEach((field) => {
      field.addEventListener("focus", () => showProjectSuggestions(field));
      field.addEventListener("input", () => showProjectSuggestions(field));
      field.addEventListener("keydown", (event) => {
        if (event.key === "Escape") ensurePublicationSuggestMenu().hidden = true;
      });
    });
  }
  const projectEditForm = document.querySelector(".project-edit-form");
  const projectField = (name) => projectEditForm?.querySelector(`[name="${name}"]`);
  const projectFieldResult = (name) => projectEditForm?.querySelector(`[data-project-field-result="${name}"]`);
  const setProjectFieldResult = (name, html, tone = "info") => {
    const target = projectFieldResult(name);
    if (!target) return;
    target.className = `publication-field-result project-field-result project-field-result-${name} tone-${tone}`;
    target.innerHTML = html || "";
  };
  if (projectEditForm) {
    projectEditForm.querySelectorAll("[data-project-check-duplicates]").forEach((button) => button.addEventListener("click", async () => {
      const targetName = button.dataset.projectResultTarget || "name";
      const params = new URLSearchParams({ uid: projectField("uid")?.value || "", name: projectField("name")?.value || "", project_number: projectField("project_number")?.value || "" });
      setProjectFieldResult(targetName, "正在查重", "info");
      try {
        const data = await fetch(`/api/admin/projects/duplicates?${params}`).then((item) => item.json());
        if (!data.matches?.length) {
          setProjectFieldResult(targetName, "<span>未发现项目名称或编号重复记录</span>", "ok");
          return;
        }
        const links = data.matches.map((item) => `<a href="${escapeHtml(item.edit_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.uid)}</a><span>${escapeHtml((item.reasons || []).join("、"))}</span>`).join("；");
        setProjectFieldResult(targetName, `可能重复：${links}`, "warn");
      } catch {
        setProjectFieldResult(targetName, "<span>查重失败</span>", "warn");
      }
    }));
  }
  const profileForm = document.querySelector(".profile-edit-form, .profile-admin-card");
  let profileSuggestionsPromise = null;
  let profileSuggestions = {};
  const loadProfileSuggestions = async () => {
    if (!profileSuggestionsPromise) {
      profileSuggestionsPromise = fetch("/api/admin/profiles/suggestions").then((item) => item.json()).then((data) => {
        profileSuggestions = data.fields || {};
        return profileSuggestions;
      }).catch(() => {
        profileSuggestions = {};
        return profileSuggestions;
      });
    }
    return profileSuggestionsPromise;
  };
  const showProfileSuggestions = async (field) => {
    const fieldName = field.dataset.profileSuggest;
    if (!fieldName) return;
    const suggestions = await loadProfileSuggestions();
    const values = suggestions[fieldName] || [];
    const lowered = field.value.trim().toLocaleLowerCase();
    const filtered = values.filter((item) => !lowered || String(item).toLocaleLowerCase().includes(lowered)).slice(0, 12);
    const menu = ensurePublicationSuggestMenu();
    if (!filtered.length) {
      menu.hidden = true;
      return;
    }
    menu.innerHTML = filtered.map((item) => `<button type="button" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("");
    positionPublicationSuggestMenu(field);
    menu.hidden = false;
    menu.querySelectorAll("button").forEach((button) => button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      field.value = button.dataset.value || "";
      field.focus();
      menu.hidden = true;
    }));
  };
  if (profileForm) {
    profileForm.querySelectorAll("[data-profile-suggest]").forEach((field) => {
      field.addEventListener("focus", () => showProfileSuggestions(field));
      field.addEventListener("input", () => showProfileSuggestions(field));
      field.addEventListener("keydown", (event) => {
        if (event.key === "Escape") ensurePublicationSuggestMenu().hidden = true;
      });
    });
  }
  const studentForm = document.querySelector(".student-edit-form, .student-admin-card");
  let studentSuggestionsPromise = null;
  let studentSuggestions = {};
  const loadStudentSuggestions = async () => {
    if (!studentSuggestionsPromise) {
      studentSuggestionsPromise = fetch("/api/admin/students/suggestions").then((item) => item.json()).then((data) => {
        studentSuggestions = data.fields || {};
        return studentSuggestions;
      }).catch(() => {
        studentSuggestions = {};
        return studentSuggestions;
      });
    }
    return studentSuggestionsPromise;
  };
  const insertStudentSuggestion = (field, value) => {
    field.value = value;
    field.focus();
  };
  const showStudentSuggestions = async (field) => {
    const fieldName = field.dataset.studentSuggest;
    if (!fieldName) return;
    const suggestions = await loadStudentSuggestions();
    const values = suggestions[fieldName] || [];
    const lowered = field.value.trim().toLocaleLowerCase();
    const filtered = values.filter((item) => !lowered || String(item).toLocaleLowerCase().includes(lowered)).slice(0, 12);
    const menu = ensurePublicationSuggestMenu();
    if (!filtered.length) {
      menu.hidden = true;
      return;
    }
    menu.innerHTML = filtered.map((item) => `<button type="button" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("");
    positionPublicationSuggestMenu(field);
    menu.hidden = false;
    menu.querySelectorAll("button").forEach((button) => button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      insertStudentSuggestion(field, button.dataset.value || "");
      menu.hidden = true;
    }));
  };
  if (studentForm) {
    studentForm.querySelectorAll("[data-student-suggest]").forEach((field) => {
      field.addEventListener("focus", () => showStudentSuggestions(field));
      field.addEventListener("input", () => showStudentSuggestions(field));
      field.addEventListener("keydown", (event) => {
        if (event.key === "Escape") ensurePublicationSuggestMenu().hidden = true;
      });
    });
  }
  const newsForm = document.querySelector(".news-edit-form, .news-admin-card");
  let newsSuggestionsPromise = null;
  let newsSuggestions = {};
  const loadNewsSuggestions = async () => {
    if (!newsSuggestionsPromise) {
      newsSuggestionsPromise = fetch("/api/admin/news/suggestions").then((item) => item.json()).then((data) => {
        newsSuggestions = data.fields || {};
        return newsSuggestions;
      }).catch(() => {
        newsSuggestions = {};
        return newsSuggestions;
      });
    }
    return newsSuggestionsPromise;
  };
  const showNewsSuggestions = async (field) => {
    const fieldName = field.dataset.newsSuggest;
    if (!fieldName) return;
    const suggestions = await loadNewsSuggestions();
    const values = suggestions[fieldName] || [];
    const isMultiCategory = fieldName === "category";
    const token = isMultiCategory ? currentSuggestionToken(field) : field.value.trim();
    const lowered = token.toLocaleLowerCase();
    const existing = new Set(splitSuggestionTokens(field.value).map((item) => item.toLocaleLowerCase()));
    const filtered = values.filter((item) => {
      const text = String(item || "").trim();
      if (!text) return false;
      const folded = text.toLocaleLowerCase();
      if (isMultiCategory && existing.has(folded) && folded !== lowered) return false;
      return !lowered || folded.includes(lowered);
    }).slice(0, 12);
    const menu = ensurePublicationSuggestMenu();
    if (!filtered.length) {
      menu.hidden = true;
      return;
    }
    menu.innerHTML = filtered.map((item) => `<button type="button" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("");
    positionPublicationSuggestMenu(field);
    menu.hidden = false;
    menu.querySelectorAll("button").forEach((button) => button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const value = button.dataset.value || "";
      if (isMultiCategory) insertDelimitedSuggestion(field, value);
      else {
        field.value = value;
        field.focus();
      }
      menu.hidden = true;
    }));
  };
  if (newsForm) {
    newsForm.querySelectorAll("[data-news-suggest]").forEach((field) => {
      field.addEventListener("focus", () => showNewsSuggestions(field));
      field.addEventListener("input", () => showNewsSuggestions(field));
      field.addEventListener("keydown", (event) => {
        if (event.key === "Escape") ensurePublicationSuggestMenu().hidden = true;
      });
    });
  }
  const newsEditForm = document.querySelector(".news-edit-form");
  const newsContentSource = newsEditForm?.querySelector("[data-news-rich-source]");
  const newsContentFormat = newsEditForm?.querySelector("[name='content_format']");
  let newsRichRange = null;
  const plainTextToRichHtml = (value) => {
    const text = String(value || "").trim();
    if (!text) return "<p><br></p>";
    return text.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  };
  const sanitizeRichHtml = (html) => {
    const holder = document.createElement("div");
    holder.innerHTML = String(html || "");
    holder.querySelectorAll("script,style,iframe,object,embed,form,input,button,textarea,select").forEach((node) => node.remove());
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
  const richModal = () => {
    let node = document.getElementById("news-rich-modal");
    if (node) return node;
    node = document.createElement("div");
    node.id = "news-rich-modal";
    node.className = "news-rich-modal";
    node.innerHTML = `
      <div class="news-rich-panel" role="dialog" aria-modal="false" aria-label="动态富文本编辑器">
        <header class="news-rich-header">
          <div><strong>动态富文本编辑器</strong><small>编辑内容后点击“应用到正文”，再保存动态。</small></div>
          <button class="button ghost" type="button" data-rich-close>关闭</button>
        </header>
        <div class="news-rich-toolbar" role="toolbar" aria-label="富文本工具栏">
          <select data-rich-block title="段落样式"><option value="p">正文</option><option value="h2">二级标题</option><option value="h3">三级标题</option><option value="blockquote">引用</option><option value="pre">代码块</option></select>
          <select data-rich-font title="字体"><option value="">默认字体</option><option value="Microsoft YaHei">微软雅黑</option><option value="SimSun">宋体</option><option value="Arial">Arial</option><option value="Times New Roman">Times</option></select>
          <select data-rich-size title="字号"><option value="">字号</option><option value="2">小</option><option value="3">正文</option><option value="4">中</option><option value="5">大</option><option value="6">特大</option></select>
          <button type="button" data-rich-cmd="bold" title="加粗"><b>B</b></button>
          <button type="button" data-rich-cmd="italic" title="斜体"><i>I</i></button>
          <button type="button" data-rich-cmd="underline" title="下划线"><u>U</u></button>
          <button type="button" data-rich-cmd="strikeThrough" title="删除线"><s>S</s></button>
          <button type="button" data-rich-cmd="insertUnorderedList" title="无序列表">列表</button>
          <button type="button" data-rich-cmd="insertOrderedList" title="有序列表">编号</button>
          <button type="button" data-rich-cmd="justifyLeft" title="靠左">左</button>
          <button type="button" data-rich-cmd="justifyCenter" title="居中">中</button>
          <button type="button" data-rich-cmd="justifyRight" title="靠右">右</button>
          <button type="button" data-rich-float="left" title="图片左悬浮">图左</button>
          <button type="button" data-rich-float="right" title="图片右悬浮">图右</button>
          <button type="button" data-rich-float="none" title="取消图片悬浮">取消浮动</button>
          <label title="文字颜色"><span>字色</span><input type="color" data-rich-color value="#173b32"></label>
          <label title="背景色"><span>背景</span><input type="color" data-rich-bg value="#f4faf6"></label>
          <button type="button" data-rich-link>链接</button>
          <button type="button" data-rich-media>插入媒体</button>
          <button type="button" data-rich-clear>清除格式</button>
        </div>
        <div class="news-rich-workspace">
          <div class="news-rich-editor" contenteditable="true" data-rich-editor spellcheck="true"></div>
          <aside class="news-rich-preview" data-rich-preview><strong>预览</strong><div></div></aside>
        </div>
        <footer class="news-rich-footer">
          <span class="admin-muted" data-rich-status>可粘贴图片文件，系统会上传并插入到正文。</span>
          <div>
            <button class="button light" type="button" data-rich-refresh-preview>刷新预览</button>
            <button class="button secondary" type="button" data-rich-apply>应用到正文</button>
          </div>
        </footer>
      </div>`;
    document.body.appendChild(node);
    bindRichModal(node);
    return node;
  };
  const richEditor = () => richModal().querySelector("[data-rich-editor]");
  const richStatus = (text) => {
    const target = richModal().querySelector("[data-rich-status]");
    if (target) target.textContent = text || "";
  };
  const saveRichSelection = () => {
    const selection = window.getSelection();
    const editor = richEditor();
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) {
      newsRichRange = selection.getRangeAt(0).cloneRange();
    }
  };
  const restoreRichSelection = () => {
    const editor = richEditor();
    editor.focus();
    const selection = window.getSelection();
    if (selection && newsRichRange) {
      selection.removeAllRanges();
      selection.addRange(newsRichRange);
    }
  };
  const normalizeFontTags = () => {
    richEditor().querySelectorAll("font[size]").forEach((font) => {
      const span = document.createElement("span");
      const sizes = { "1": "12px", "2": "14px", "3": "16px", "4": "18px", "5": "22px", "6": "28px", "7": "34px" };
      span.style.fontSize = sizes[font.getAttribute("size")] || "16px";
      span.innerHTML = font.innerHTML;
      font.replaceWith(span);
    });
    richEditor().querySelectorAll("font[face]").forEach((font) => {
      const span = document.createElement("span");
      span.style.fontFamily = font.getAttribute("face") || "";
      span.innerHTML = font.innerHTML;
      font.replaceWith(span);
    });
  };
  const refreshRichPreview = () => {
    const html = sanitizeRichHtml(richEditor().innerHTML || "");
    const box = richModal().querySelector("[data-rich-preview] div");
    if (box) box.innerHTML = html || "<p class='admin-muted'>暂无内容</p>";
  };
  const applyRichCommand = (command, value = null) => {
    restoreRichSelection();
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(command, false, value);
    normalizeFontTags();
    saveRichSelection();
    refreshRichPreview();
  };
  const selectedRichImage = () => {
    const selection = window.getSelection();
    let node = selection?.anchorNode || null;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    return node?.closest?.("img") || null;
  };
  const setRichImageFloat = (direction) => {
    const img = selectedRichImage();
    if (!img) {
      richStatus("请先点击正文中的图片，再设置悬浮。");
      return;
    }
    if (direction === "none") {
      img.style.float = "";
      img.style.margin = "";
      img.style.maxWidth = "100%";
    } else {
      img.style.float = direction;
      img.style.width = "min(42%, 360px)";
      img.style.maxWidth = "100%";
      img.style.margin = direction === "left" ? "4px 14px 10px 0" : "4px 0 10px 14px";
    }
    refreshRichPreview();
  };
  const insertRichHtml = (html) => {
    restoreRichSelection();
    document.execCommand("insertHTML", false, html);
    saveRichSelection();
    refreshRichPreview();
  };
  const insertRichMedia = ({ key, url }) => {
    const mediaUrl = url || mediaPreviewUrl(key);
    const alt = key || "media";
    const type = mediaPreviewType(key || mediaUrl);
    if (type === "image") {
      insertRichHtml(`<figure><img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" style="max-width:100%;height:auto;"><figcaption></figcaption></figure><p><br></p>`);
    } else if (type === "video") {
      insertRichHtml(`<figure><video src="${escapeHtml(mediaUrl)}" controls preload="metadata" style="max-width:100%;height:auto;"></video><figcaption></figcaption></figure><p><br></p>`);
    } else {
      insertRichHtml(`<p><a href="${escapeHtml(mediaUrl)}" target="_blank" rel="noreferrer">${escapeHtml(alt)}</a></p>`);
    }
    richStatus(`已插入媒体：${key || mediaUrl}`);
  };
  const uploadRichMediaFile = async (file) => {
    const form = new FormData();
    form.append("file", file);
    form.append("title", readableTitleFromFile(file.name || "pasted-media"));
    form.append("file_name", `${Date.now()}-${safeMediaName(file.name || "pasted-media.png")}`);
    form.append("folder", "news");
    richStatus(`正在上传：${file.name || "粘贴媒体"}`);
    const data = await fetch("/api/admin/media/upload", { method: "POST", body: form }).then((item) => item.json());
    if (!data.ok) throw new Error(data.message || "上传失败");
    insertRichMedia({ key: data.key || "", url: data.url || "" });
  };
  const newsContentUploadStatus = (message) => {
    const target = newsEditForm?.querySelector("[data-news-content-upload-status]");
    if (target) target.textContent = message || "";
  };
  const insertIntoNewsContent = (html) => {
    if (!newsContentSource) return;
    const current = newsContentFormat?.value || "plain";
    if (current !== "html") {
      newsContentSource.value = plainTextToRichHtml(newsContentSource.value || "");
      if (newsContentFormat) newsContentFormat.value = "html";
    }
    const addition = String(html || "").trim();
    if (!addition) return;
    const glue = newsContentSource.value.trim() ? "\n" : "";
    newsContentSource.value = `${newsContentSource.value}${glue}${addition}`;
    newsContentSource.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const richMediaHtml = ({ key, url }) => {
    const mediaUrl = url || mediaPreviewUrl(key);
    const alt = key || "media";
    const type = mediaPreviewType(key || mediaUrl);
    if (type === "image") return `<figure><img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" style="max-width:100%;height:auto;"><figcaption></figcaption></figure>`;
    if (type === "video") return `<figure><video src="${escapeHtml(mediaUrl)}" controls preload="metadata" style="max-width:100%;height:auto;"></video><figcaption></figcaption></figure>`;
    return `<p><a href="${escapeHtml(mediaUrl)}" target="_blank" rel="noreferrer">${escapeHtml(alt)}</a></p>`;
  };
  const insertNewsContentMedia = (item) => {
    insertIntoNewsContent(richMediaHtml(item));
    newsContentUploadStatus(`已插入：${item.key || item.url || "媒体"}。请继续保存动态。`);
  };
  const uploadNewsContentFile = async (file) => {
    if (!file || !newsContentSource) return;
    const form = new FormData();
    form.append("file", file);
    form.append("title", readableTitleFromFile(file.name || "news-media"));
    form.append("file_name", `${Date.now()}-${safeMediaName(file.name || "news-media.bin")}`);
    form.append("folder", "news");
    newsContentUploadStatus(`正在上传：${file.name || "媒体文件"}`);
    const data = await fetch("/api/admin/media/upload", { method: "POST", body: form }).then((item) => item.json());
    if (!data.ok) throw new Error(data.message || "上传失败");
    insertNewsContentMedia({ key: data.key || "", url: data.url || "" });
  };

  const openNewsRichEditor = (previewOnly = false) => {
    if (!newsContentSource) return;
    const toolUrl = `/admin/tools/news-rich-editor?mode=${previewOnly ? "preview" : "edit"}`;
    const popup = window.open(toolUrl, "_blank", "width=1280,height=860,resizable=yes,scrollbars=yes");
    if (popup) {
      popup.focus();
      return;
    }
    const modal = richModal();
    const editor = modal.querySelector("[data-rich-editor]");
    const fmt = newsContentFormat?.value || "plain";
    editor.innerHTML = fmt === "html" ? (newsContentSource.value || "<p><br></p>") : plainTextToRichHtml(newsContentSource.value || "");
    modal.classList.add("is-open");
    refreshRichPreview();
    if (!previewOnly) {
      editor.focus();
      saveRichSelection();
    }
  };
  const bindRichModal = (node) => {
    const editor = node.querySelector("[data-rich-editor]");
    const panel = node.querySelector(".news-rich-panel");
    const header = node.querySelector(".news-rich-header");
    let draggingPanel = null;
    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button,input,select,a,label")) return;
      const rect = panel.getBoundingClientRect();
      draggingPanel = { id: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    header.addEventListener("pointermove", (event) => {
      if (!draggingPanel || draggingPanel.id !== event.pointerId) return;
      const nextLeft = Math.max(8, Math.min(window.innerWidth - 96, draggingPanel.left + event.clientX - draggingPanel.startX));
      const nextTop = Math.max(8, Math.min(window.innerHeight - 72, draggingPanel.top + event.clientY - draggingPanel.startY));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    });
    header.addEventListener("pointerup", (event) => {
      if (draggingPanel?.id === event.pointerId) {
        panel.releasePointerCapture?.(event.pointerId);
        draggingPanel = null;
      }
    });
    header.addEventListener("pointercancel", () => { draggingPanel = null; });
    node.querySelector("[data-rich-close]").addEventListener("click", () => node.classList.remove("is-open"));
    node.querySelectorAll("[data-rich-cmd]").forEach((button) => button.addEventListener("click", () => applyRichCommand(button.dataset.richCmd)));
    node.querySelector("[data-rich-block]").addEventListener("change", (event) => applyRichCommand("formatBlock", event.target.value || "p"));
    node.querySelector("[data-rich-font]").addEventListener("change", (event) => {
      if (event.target.value) applyRichCommand("fontName", event.target.value);
    });
    node.querySelector("[data-rich-size]").addEventListener("change", (event) => {
      if (event.target.value) applyRichCommand("fontSize", event.target.value);
    });
    node.querySelector("[data-rich-color]").addEventListener("input", (event) => applyRichCommand("foreColor", event.target.value));
    node.querySelector("[data-rich-bg]").addEventListener("input", (event) => applyRichCommand("hiliteColor", event.target.value));
    node.querySelectorAll("[data-rich-float]").forEach((button) => button.addEventListener("click", () => setRichImageFloat(button.dataset.richFloat || "none")));
    node.querySelector("[data-rich-link]").addEventListener("click", () => {
      const href = prompt("请输入链接地址（http/https/mailto/#）：", "https://");
      if (href) applyRichCommand("createLink", href);
    });
    node.querySelector("[data-rich-clear]").addEventListener("click", () => applyRichCommand("removeFormat"));
    node.querySelector("[data-rich-media]").addEventListener("click", () => {
      saveRichSelection();
      pickerState.input = null;
      pickerState.purpose = "news_content";
      pickerState.onSelect = (item) => insertRichMedia(item);
      const mediaNode = picker();
      const folderInput = mediaNode.querySelector("[data-picker-upload-folder]");
      if (folderInput) {
        folderInput.value = "news";
        delete folderInput.dataset.touched;
      }
      mediaNode.querySelectorAll("[data-picker-upload-title], [data-picker-upload-name]").forEach((field) => {
        field.value = "";
        delete field.dataset.touched;
      });
      mediaNode.classList.add("is-open");
      showPickerView("library");
      loadMediaOptions("", { reset: true });
    });
    node.querySelector("[data-rich-refresh-preview]").addEventListener("click", refreshRichPreview);
    node.querySelector("[data-rich-apply]").addEventListener("click", () => {
      newsContentSource.value = sanitizeRichHtml(editor.innerHTML || "");
      if (newsContentFormat) newsContentFormat.value = "html";
      newsContentSource.dispatchEvent(new Event("input", { bubbles: true }));
      richStatus("已应用到正文输入框，请继续点击页面底部保存。");
      node.classList.remove("is-open");
    });
    editor.addEventListener("keyup", saveRichSelection);
    editor.addEventListener("mouseup", saveRichSelection);
    editor.addEventListener("input", () => {
      saveRichSelection();
      refreshRichPreview();
    });
    editor.addEventListener("paste", async (event) => {
      const files = Array.from(event.clipboardData?.files || []).filter((file) => /^(image|video)\//.test(file.type));
      if (!files.length) return;
      event.preventDefault();
      for (const file of files) {
        try {
          await uploadRichMediaFile(file);
        } catch (error) {
          richStatus(error.message || "粘贴媒体上传失败");
        }
      }
    });
  };
  if (newsContentSource) {
    newsEditForm.querySelector("[data-news-rich-open]")?.addEventListener("click", () => openNewsRichEditor(false));
    newsEditForm.querySelector("[data-news-rich-preview]")?.addEventListener("click", () => openNewsRichEditor(true));
    const uploadButton = newsEditForm.querySelector("[data-news-content-upload]");
    const uploadInput = newsEditForm.querySelector("[data-news-content-upload-file]");
    uploadButton?.addEventListener("click", () => uploadInput?.click());
    uploadInput?.addEventListener("change", async () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      try {
        await uploadNewsContentFile(file);
      } catch (error) {
        newsContentUploadStatus(error.message || "上传失败");
      } finally {
        uploadInput.value = "";
      }
    });
  }
  const courseForm = document.querySelector(".course-edit-form, .course-admin-card");
  let courseSuggestionsPromise = null;
  let courseSuggestions = {};
  const loadCourseSuggestions = async () => {
    if (!courseSuggestionsPromise) {
      courseSuggestionsPromise = fetch("/api/admin/courses/suggestions").then((item) => item.json()).then((data) => {
        courseSuggestions = data.fields || {};
        return courseSuggestions;
      }).catch(() => {
        courseSuggestions = {};
        return courseSuggestions;
      });
    }
    return courseSuggestionsPromise;
  };
  const showCourseSuggestions = async (field) => {
    const fieldName = field.dataset.courseSuggest;
    if (!fieldName) return;
    const suggestions = await loadCourseSuggestions();
    const values = suggestions[fieldName] || [];
    const lowered = field.value.trim().toLocaleLowerCase();
    const filtered = values.filter((item) => !lowered || String(item).toLocaleLowerCase().includes(lowered)).slice(0, 12);
    const menu = ensurePublicationSuggestMenu();
    if (!filtered.length) {
      menu.hidden = true;
      return;
    }
    menu.innerHTML = filtered.map((item) => `<button type="button" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("");
    positionPublicationSuggestMenu(field);
    menu.hidden = false;
    menu.querySelectorAll("button").forEach((button) => button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      field.value = button.dataset.value || "";
      field.focus();
      menu.hidden = true;
    }));
  };
  if (courseForm) {
    courseForm.querySelectorAll("[data-course-suggest]").forEach((field) => {
      field.addEventListener("focus", () => showCourseSuggestions(field));
      field.addEventListener("input", () => showCourseSuggestions(field));
      field.addEventListener("keydown", (event) => {
        if (event.key === "Escape") ensurePublicationSuggestMenu().hidden = true;
      });
    });
  }
  const patentForm = document.querySelector(".patent-edit-form, .patent-admin-card");
  const patentEditForm = document.querySelector(".patent-edit-form");
  const patentStatus = patentEditForm?.querySelector("[data-patent-status]");
  const setPatentStatus = (text) => {
    if (patentStatus) patentStatus.textContent = text || "";
  };
  const patentField = (name) => patentEditForm?.querySelector(`[name="${name}"]`);
  const patentFieldResult = (name) => patentEditForm?.querySelector(`[data-patent-field-result="${name}"]`);
  const setPatentFieldResult = (name, html, tone = "info") => {
    const target = patentFieldResult(name);
    if (!target) return;
    target.className = `publication-field-result patent-field-result patent-field-result-${name} tone-${tone}`;
    target.innerHTML = html || "";
  };
  const patentFormParams = () => {
    const params = new URLSearchParams();
    if (!patentEditForm) return params;
    patentEditForm.querySelectorAll("input[name], textarea[name], select[name]").forEach((field) => {
      if ((field.type === "checkbox" || field.type === "radio") && !field.checked) return;
      params.set(field.name, field.value || "");
    });
    return params;
  };
  const setPatentField = (name, value, markOriginal = false) => {
    const field = patentField(name);
    if (!field || value === undefined || value === null || value === "") return false;
    const next = String(value);
    if (field.value === next) return false;
    if (markOriginal) {
      let note = field.closest("label")?.querySelector(".field-original-value");
      if (!note) {
        note = document.createElement("small");
        note.className = "field-original-value";
        field.closest("label")?.appendChild(note);
      }
      const previous = field.value || "空";
      note.innerHTML = `原内容：${escapeHtml(previous)} <button type="button" data-patent-undo="${escapeHtml(name)}">撤销</button>`;
      note.dataset.originalValue = field.value || "";
    }
    field.value = next;
    return true;
  };
  const applyPatentFields = (fields, markOriginal = false) => {
    let changed = 0;
    Object.entries(fields || {}).forEach(([name, value]) => {
      if (setPatentField(name, value, markOriginal)) changed += 1;
    });
    return changed;
  };
  const patentPlatforms = () => Array.from(document.querySelectorAll(".patent-platforms input[name='patent_metadata_platforms']:checked")).map((item) => item.value).join(",");
  const patentExternalQuery = () => {
    const values = [patentField("grant_number")?.value, patentField("application_number")?.value, patentField("name")?.value];
    return values.map((item) => String(item || "").trim()).find(Boolean) || "";
  };
  let patentSuggestionsPromise = null;
  let patentSuggestions = {};
  const loadPatentSuggestions = async () => {
    if (!patentSuggestionsPromise) {
      patentSuggestionsPromise = fetch("/api/admin/patents/suggestions").then((item) => item.json()).then((data) => {
        patentSuggestions = data.fields || {};
        return patentSuggestions;
      }).catch(() => {
        patentSuggestions = {};
        return patentSuggestions;
      });
    }
    return patentSuggestionsPromise;
  };
  const patentCurrentToken = (field) => {
    const cursor = field.selectionStart ?? field.value.length;
    const before = field.value.slice(0, cursor);
    const marker = Math.max(before.lastIndexOf(","), before.lastIndexOf("，"), before.lastIndexOf(";"), before.lastIndexOf("；"), before.lastIndexOf("\n"));
    return before.slice(marker + 1).trim();
  };
  const insertPatentSuggestion = (field, value) => {
    if (field.dataset.patentSuggest === "inventors") {
      const cursor = field.selectionStart ?? field.value.length;
      const before = field.value.slice(0, cursor);
      const after = field.value.slice(cursor);
      const marker = Math.max(before.lastIndexOf(","), before.lastIndexOf("，"), before.lastIndexOf(";"), before.lastIndexOf("；"), before.lastIndexOf("\n"));
      const prefix = marker >= 0 ? before.slice(0, marker + 1) + (before[marker] === "\n" ? "" : " ") : "";
      const suffix = after && /^[,，;；\n]/.test(after) ? after : after ? `, ${after.trimStart()}` : ", ";
      field.value = `${prefix}${value}${suffix}`;
      field.focus();
      field.selectionStart = field.selectionEnd = (prefix + value).length;
      return;
    }
    field.value = value;
    field.focus();
  };
  const showPatentSuggestions = async (field) => {
    const fieldName = field.dataset.patentSuggest;
    if (!fieldName) return;
    const suggestions = await loadPatentSuggestions();
    const values = suggestions[fieldName] || [];
    const token = fieldName === "inventors" ? patentCurrentToken(field) : field.value.trim();
    const lowered = token.toLocaleLowerCase();
    const filtered = values.filter((item) => !lowered || String(item).toLocaleLowerCase().includes(lowered)).slice(0, 12);
    const menu = ensurePublicationSuggestMenu();
    if (!filtered.length) {
      menu.hidden = true;
      return;
    }
    menu.innerHTML = filtered.map((item) => `<button type="button" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("");
    positionPublicationSuggestMenu(field);
    menu.hidden = false;
    menu.querySelectorAll("button").forEach((button) => button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      insertPatentSuggestion(field, button.dataset.value || "");
      menu.hidden = true;
    }));
  };
  if (patentForm) {
    patentForm.querySelectorAll("[data-patent-suggest]").forEach((field) => {
      field.addEventListener("focus", () => showPatentSuggestions(field));
      field.addEventListener("input", () => showPatentSuggestions(field));
      field.addEventListener("keydown", (event) => {
        if (event.key === "Escape") ensurePublicationSuggestMenu().hidden = true;
      });
    });
  }
  if (patentEditForm) {
    patentEditForm.querySelectorAll("[data-patent-check-duplicates]").forEach((button) => button.addEventListener("click", async () => {
      const targetName = button.dataset.patentResultTarget || "name";
      const params = new URLSearchParams({ uid: patentField("uid")?.value || "", name: patentField("name")?.value || "", application_number: patentField("application_number")?.value || "", grant_number: patentField("grant_number")?.value || "" });
      setPatentStatus("正在查重");
      setPatentFieldResult(targetName, "正在查重", "info");
      try {
        const data = await fetch(`/api/admin/patents/duplicates?${params}`).then((item) => item.json());
        if (!data.matches?.length) {
          setPatentFieldResult(targetName, "<span>未发现名称、申请号或授权号重复记录</span>", "ok");
          setPatentStatus("未发现重复记录");
          return;
        }
        const links = data.matches.map((item) => `<a href="${escapeHtml(item.edit_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.uid)}</a><span>${escapeHtml((item.reasons || []).join("、"))}</span>`).join("；");
        setPatentFieldResult(targetName, `可能重复：${links}`, "warn");
        setPatentStatus(`发现 ${data.matches.length} 条可能重复记录`);
      } catch {
        setPatentFieldResult(targetName, "<span>查重失败</span>", "warn");
        setPatentStatus("查重失败");
      }
    }));
    patentEditForm.querySelectorAll("[data-patent-lookup-field]").forEach((button) => button.addEventListener("click", async () => {
      const fieldName = button.dataset.patentLookupField || "name";
      const targetName = button.dataset.patentResultTarget || fieldName;
      const params = patentFormParams();
      params.set("platforms", patentPlatforms());
      params.set("lookup_text", patentField(fieldName)?.value || "");
      setPatentStatus("正在联网查验");
      setPatentFieldResult(targetName, "正在联网查验并准备修正", "info");
      try {
        const data = await fetch("/api/admin/patents/lookup", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: params }).then((item) => item.json());
        const changed = applyPatentFields(data.fields || {}, true);
        const messages = (data.results || []).map((item) => `${item.platform}: ${item.message || (item.ok ? "ok" : "无结果")}`).join("；");
        setPatentFieldResult(targetName, changed ? `已修正 ${changed} 个字段` : `未发现可修正字段`, changed ? "ok" : "warn");
        setPatentStatus(changed ? `已修正 ${changed} 个字段。${messages}` : `未发现可修正字段。${messages}`);
      } catch {
        setPatentFieldResult(targetName, "联网查验失败", "warn");
        setPatentStatus("联网查验失败");
      }
    }));
    patentEditForm.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-patent-undo]");
      if (!button) return;
      const field = patentField(button.dataset.patentUndo);
      const note = button.closest(".field-original-value");
      if (field && note) {
        field.value = note.dataset.originalValue || "";
        note.remove();
        setPatentStatus("已撤销该字段修正");
      }
    });
    patentEditForm.querySelectorAll("[data-patent-external-url]").forEach((button) => button.addEventListener("click", () => {
      const template = button.dataset.patentExternalUrl || "";
      const query = patentExternalQuery();
      if (button.dataset.patentExternalQuery === "1" && !query) {
        setPatentStatus("请先填写专利名称、申请号或授权号，再打开外部检索。");
        return;
      }
      const url = template.replace("{query}", encodeURIComponent(query));
      window.open(url, "_blank", "noopener,noreferrer");
      setPatentStatus(`已打开外部检索：${button.textContent.trim()}`);
    }));
  }
  document.addEventListener("click", (event) => {
    if (!publicationSuggestMenu || publicationSuggestMenu.hidden) return;
    const target = event.target;
    if (target instanceof Element && (target.closest(".publication-suggest-menu") || target.closest("[data-publication-suggest]") || target.closest("[data-project-suggest]") || target.closest("[data-profile-suggest]") || target.closest("[data-patent-suggest]") || target.closest("[data-student-suggest]") || target.closest("[data-news-suggest]") || target.closest("[data-course-suggest]"))) return;
    publicationSuggestMenu.hidden = true;
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(".media-picker-trigger");
    if (!button) return;
    event.preventDefault();
    const name = button.dataset.mediaTarget;
    pickerState.input = button.closest("label")?.querySelector(`[name="${name}"]`) || document.querySelector(`[name="${name}"]`);
    pickerState.purpose = button.dataset.mediaPurpose || name || "";
    pickerState.onSelect = null;
    const node = picker();
    const folderInput = node.querySelector("[data-picker-upload-folder]");
    if (folderInput) {
      folderInput.value = folderForPurpose(pickerState.purpose, pickerState.input?.value || "");
      delete folderInput.dataset.touched;
    }
    node.querySelectorAll("[data-picker-upload-title], [data-picker-upload-name]").forEach((field) => {
      field.value = "";
      delete field.dataset.touched;
    });
    node.classList.add("is-open");
    showPickerView("library");
    loadMediaOptions("", { reset: true });
  });

  const setupFloatingToggle = (buttonSelector, panelSelector, bodyClass) => {
    const button = document.querySelector(buttonSelector);
    const panel = document.querySelector(panelSelector);
    if (!button || !panel) return null;
    const setOpen = (open) => {
      document.body.classList.toggle(bodyClass, open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
    };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const open = !document.body.classList.contains(bodyClass);
      setOpen(open);
    });
    panel.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        if (window.matchMedia("(max-width: 820px)").matches) setOpen(false);
      });
    });
    return setOpen;
  };
  const closeFrontNav = setupFloatingToggle("[data-front-nav-toggle]", "#front-site-nav", "front-nav-open");
  const closeAdminNav = setupFloatingToggle("[data-admin-nav-toggle]", "#admin-sidebar-panel", "admin-nav-open");
  const runDangerConfirmation = (target) => {
    const message = target.dataset.confirm || "确定继续执行此操作吗？";
    if (!confirm(message)) return false;
    const token = (target.dataset.confirmToken || "").trim();
    const second = target.dataset.confirmSecond || (token ? `二次确认：请输入 ${token} 后继续。` : "");
    if (!second && !token) return true;
    if (!token) return confirm(second);
    const input = prompt(second, "");
    return input !== null && input.trim() === token;
  };
  document.addEventListener("submit", (event) => {
    const target = event.target?.closest?.("form[data-confirm]");
    if (!target) return;
    if (!runDangerConfirmation(target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  document.addEventListener("click", (event) => {
    const target = event.target?.closest?.("[data-confirm]");
    if (!target) return;
    if (target.matches("form") || target.closest("form[data-confirm]")) return;
    if (!runDangerConfirmation(target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  const backToTop = document.querySelector("[data-back-to-top]");
  if (backToTop) {
    const refreshBackToTop = () => {
      backToTop.classList.toggle("is-visible", window.scrollY > 420);
    };
    backToTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    window.addEventListener("scroll", refreshBackToTop, { passive: true });
    refreshBackToTop();
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeFrontNav?.(false);
    closeAdminNav?.(false);
  });


  const initIdentifierDuplicateChecks = () => {
    document.querySelectorAll("[data-identifier-check]").forEach((button) => {
      if (button.dataset.ready) return;
      button.dataset.ready = "1";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const field = button.dataset.identifierCheck || "";
        const label = button.closest("label");
        const form = button.closest("form");
        const input = label?.querySelector(`[name="${CSS.escape(field)}"]`);
        const result = label?.querySelector(`[data-identifier-result="${CSS.escape(field)}"]`);
        if (!form || !input || !result) return;
        const match = String(form.getAttribute("action") || "").match(/\/admin\/table\/([^/]+)\/save/);
        const table = match?.[1] || "";
        const currentMatch = window.location.pathname.match(/\/admin\/table\/[^/]+\/([^/?#]+)/);
        const current = currentMatch ? decodeURIComponent(currentMatch[1]) : "";
        const value = input.value.trim();
        if (!value) {
          result.className = "field-check-result is-warn";
          result.textContent = "请先填写标识内容。";
          return;
        }
        const params = new URLSearchParams({ table, field, value, current });
        button.disabled = true;
        const oldText = button.textContent;
        button.textContent = "检查中";
        result.className = "field-check-result is-info";
        result.textContent = "正在查重...";
        try {
          const data = await fetch(`/api/admin/identifiers/duplicates?${params}`).then((item) => item.json());
          if (!data.ok) {
            result.className = "field-check-result is-warn";
            result.textContent = data.message || "查重失败。";
            return;
          }
          const lengthNote = `长度 ${Number(data.length || value.length)}`;
          if (!data.matches?.length) {
            result.className = "field-check-result is-ok";
            result.innerHTML = `<span>${lengthNote}；未发现重复。</span>`;
            return;
          }
          const links = data.matches.map((item) => `<a href="${escapeHtml(item.edit_url)}" target="_blank" rel="noreferrer">调整：${escapeHtml(item.title || item.uid || item.value)}</a><span>${escapeHtml((item.reasons || []).join("、"))}</span>`).join("；");
          result.className = "field-check-result is-warn";
          result.innerHTML = `<span>${lengthNote}；发现 ${data.matches.length} 条重复：</span>${links}`;
        } catch (error) {
          result.className = "field-check-result is-warn";
          result.textContent = "查重失败，请稍后重试。";
        } finally {
          button.disabled = false;
          button.textContent = oldText;
        }
      });
    });
  };
  initIdentifierDuplicateChecks();

  const initNavigationScopeBuilders = () => {
    document.querySelectorAll("[data-nav-scope-builder]:not([data-ready])").forEach((root) => {
      root.dataset.ready = "1";
      const dataNode = root.querySelector("[data-nav-scope-data]");
      let tables = [];
      try {
        tables = JSON.parse((dataNode?.innerHTML || dataNode?.textContent || "[]").trim());
      } catch (error) {
        tables = [];
      }
      const tableSelect = root.querySelector("[data-nav-scope-table]");
      const conditions = root.querySelector("[data-nav-scope-conditions]");
      const output = root.querySelector("[data-nav-scope-output]");
      const summary = root.querySelector("[data-nav-scope-summary]");
      if (!tableSelect || !conditions || !output || !summary) return;
      const pathInput = document.querySelector('.nav-edit-form input[name="path"]');
      const makeOption = (value, label) => {
        const item = document.createElement("option");
        item.value = value || "";
        item.textContent = label || value || "";
        return item;
      };
      const escapeNavHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
      const currentTable = () => tables.find((item) => item.table === tableSelect.value) || tables[0] || { fields: [], path: "" };
      const fieldByName = (name) => (currentTable().fields || []).find((item) => item.name === name) || (currentTable().fields || [])[0] || { name: "", label: "", values: [] };
      const fillFieldSelect = (select, selected) => {
        select.innerHTML = "";
        (currentTable().fields || []).forEach((field) => select.appendChild(makeOption(field.name, `${field.label} (${field.name})`)));
        if (selected && Array.from(select.options).some((item) => item.value === selected)) select.value = selected;
      };
      const fillValueSelect = (row, selected) => {
        const fieldSelect = row.querySelector("[data-nav-scope-field]");
        const valueSelect = row.querySelector("[data-nav-scope-value]");
        const fieldManual = row.querySelector("[data-nav-scope-field-manual]");
        const valueManual = row.querySelector("[data-nav-scope-value-manual]");
        if (!fieldSelect || !valueSelect || !fieldManual || !valueManual) return;
        const field = fieldByName(fieldSelect.value);
        valueSelect.innerHTML = "";
        (field.values || []).forEach((item) => valueSelect.appendChild(makeOption(item.value, `${item.value} (${item.count})`)));
        if (selected && Array.from(valueSelect.options).some((item) => item.value === selected)) valueSelect.value = selected;
        fieldManual.value = field.name || fieldManual.value || "";
        valueManual.value = valueSelect.value || valueManual.value || "";
      };
      const buildPath = () => {
        const table = currentTable();
        const parts = [];
        conditions.querySelectorAll("[data-nav-scope-row]").forEach((row) => {
          const field = (row.querySelector("[data-nav-scope-field-manual]")?.value || "").trim();
          const value = (row.querySelector("[data-nav-scope-value-manual]")?.value || "").trim();
          if (field && value) parts.push(`scope_${field}=${value}`);
        });
        const query = parts.join("&");
        output.value = table.path && query ? `${table.path}?${query}` : (table.path || "");
        return output.value;
      };
      const renderSummary = () => {
        const fields = currentTable().fields || [];
        summary.innerHTML = fields.length ? fields.map((field) => {
          const chips = (field.values || []).slice(0, 8).map((item) => `<span>${escapeNavHtml(item.value)} <em>${escapeNavHtml(item.count)}</em></span>`).join("");
          const more = (field.values || []).length > 8 ? `<span>+${(field.values || []).length - 8}</span>` : "";
          return `<div class="nav-scope-field-row"><strong>${escapeNavHtml(field.label)} <code>${escapeNavHtml(field.name)}</code></strong><div>${chips || "<span>暂无已有取值，可手动输入</span>"}${more}</div></div>`;
        }).join("") : "<span>当前表没有可用于固定筛选的字段。</span>";
      };
      const bindRow = (row) => {
        const fieldSelect = row.querySelector("[data-nav-scope-field]");
        const valueSelect = row.querySelector("[data-nav-scope-value]");
        const fieldManual = row.querySelector("[data-nav-scope-field-manual]");
        const valueManual = row.querySelector("[data-nav-scope-value-manual]");
        if (!fieldSelect || !valueSelect || !fieldManual || !valueManual) return;
        fillFieldSelect(fieldSelect, fieldSelect.value);
        fillValueSelect(row, valueSelect.value);
        fieldSelect.addEventListener("change", () => {
          fieldManual.value = fieldSelect.value || "";
          fillValueSelect(row, "");
          buildPath();
        });
        valueSelect.addEventListener("change", () => {
          valueManual.value = valueSelect.value || "";
          buildPath();
        });
        fieldManual.addEventListener("input", buildPath);
        valueManual.addEventListener("input", buildPath);
        row.querySelector("[data-nav-scope-remove]")?.addEventListener("click", () => {
          row.remove();
          if (!conditions.querySelector("[data-nav-scope-row]")) addRow();
          buildPath();
        });
      };
      const addRow = () => {
        const row = document.createElement("div");
        row.className = "nav-scope-condition-row";
        row.dataset.navScopeRow = "1";
        row.innerHTML = '<label><span>字段</span><select data-nav-scope-field></select></label><label><span>手动字段名</span><input type="text" data-nav-scope-field-manual placeholder="如 category / status"></label><label><span>取值</span><select data-nav-scope-value></select></label><label><span>手动取值</span><input type="text" data-nav-scope-value-manual placeholder="可输入新值"></label><button class="button ghost" type="button" data-nav-scope-remove>移除</button>';
        conditions.appendChild(row);
        bindRow(row);
        buildPath();
      };
      const renderTable = () => {
        const rowCount = Math.max(1, conditions.querySelectorAll("[data-nav-scope-row]").length);
        conditions.innerHTML = "";
        for (let index = 0; index < rowCount; index += 1) addRow();
        renderSummary();
        buildPath();
      };
      if (tables.length) {
        const selected = tableSelect.value;
        tableSelect.innerHTML = "";
        tables.forEach((item) => tableSelect.appendChild(makeOption(item.table, `${item.label} - ${item.path}`)));
        if (selected && Array.from(tableSelect.options).some((item) => item.value === selected)) tableSelect.value = selected;
      }
      conditions.querySelectorAll("[data-nav-scope-row]").forEach(bindRow);
      tableSelect.addEventListener("change", renderTable);
      root.querySelector("[data-nav-scope-add]")?.addEventListener("click", addRow);
      root.querySelector("[data-nav-scope-apply]")?.addEventListener("click", () => {
        if (pathInput) pathInput.value = buildPath();
      });
      root.querySelector("[data-nav-scope-copy]")?.addEventListener("click", async () => {
        const value = buildPath();
        try {
          await navigator.clipboard.writeText(value);
        } catch (error) {
          output.select();
          document.execCommand("copy");
        }
      });
      renderSummary();
      buildPath();
    });
  };
  initNavigationScopeBuilders();

  const prefetchCommonPages = () => {
    if (document.body?.classList.contains("admin-page")) return;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData || /(^|-)2g$/.test(String(connection?.effectiveType || ""))) return;
    const current = window.location.pathname.replace(/\/$/, "") || "/";
    ["/publications", "/projects", "/patents", "/team"].filter((path) => path !== current).forEach((path) => {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = path;
      link.as = "document";
      document.head.appendChild(link);
    });
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(prefetchCommonPages, { timeout: 2500 });
  } else {
    window.setTimeout(prefetchCommonPages, 1800);
  }

})();
