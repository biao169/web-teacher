(function () {
  installSuggestions();
  installDuplicateChecks();
  installMediaKeyTools();
  installTranslationTools();
  installPublicationTools();
  installBulkActionConfirm();
  installQuickForms();

  function installSuggestions() {
    document.querySelectorAll("[data-suggest]").forEach(async (input) => {
      const [table, fieldName] = (input.dataset.suggest || "").split(":");
      if (!table || !fieldName) return;
      const listId = `suggest-${table}-${fieldName}`;
      let list = document.getElementById(listId);
      if (!list) {
        list = document.createElement("datalist");
        list.id = listId;
        document.body.appendChild(list);
      }
      input.setAttribute("list", listId);
      try {
        const response = await fetch(`/api/suggestions/${table}/${fieldName}`);
        const data = await response.json();
        list.replaceChildren(...(data.values || []).map((value) => {
          const item = document.createElement("option");
          item.value = value;
          return item;
        }));
      } catch {
        // Suggestions are optional.
      }
    });
  }

  function installDuplicateChecks() {
    document.querySelectorAll(".duplicate-panel").forEach((panel) => {
      const button = panel.querySelector("[data-duplicate-run]");
      const result = panel.querySelector("[data-duplicate-result]");
      button?.addEventListener("click", async () => {
        const table = panel.dataset.duplicateTable;
        const id = panel.dataset.duplicateId || "";
        const fields = (panel.dataset.duplicateFields || "").split(",").filter(Boolean);
        const params = new URLSearchParams();
        if (id) params.set("id", id);
        fields.forEach((name) => {
          const input = field(name);
          if (input && input.value) params.set(name, input.value);
        });
        if (![...params.keys()].some((key) => key !== "id")) {
          setTone(result, "请先填写用于查重的关键字段。", "warn");
          return;
        }
        button.disabled = true;
        setTone(result, "正在检查相似记录...", "info");
        try {
          const response = await fetch(`/api/admin/duplicates/${table}?${params.toString()}`);
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error || "查重失败");
          const matches = data.matches || [];
          if (!matches.length) {
            setTone(result, "未发现重复记录。", "success");
            return;
          }
          result.dataset.tone = "warn";
          result.innerHTML = matches.map((item) => `<a href="/admin/table/${table}/${item.id}">#${item.id} ${escapeHtml(item.title || "")}</a>`).join("<br>");
        } catch (error) {
          setTone(result, error.message || "查重失败", "error");
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function installMediaKeyTools() {
    document.querySelectorAll('input[name$="_key"], input[name="object_key"]').forEach((input) => {
      const wrap = document.createElement("div");
      wrap.className = "media-key-tools";
      const preview = document.createElement("a");
      preview.textContent = "打开媒体";
      preview.target = "_blank";
      preview.rel = "noreferrer";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "复制 key";
      const sync = () => {
        const value = (input.value || "").replace(/^\/+/, "");
        preview.href = value ? `/media/${value}` : "#";
        preview.hidden = !value;
        copy.disabled = !value;
      };
      copy.addEventListener("click", async () => {
        await navigator.clipboard.writeText(input.value || "");
        copy.textContent = "已复制";
        setTimeout(() => { copy.textContent = "复制 key"; }, 1200);
      });
      sync();
      input.addEventListener("input", sync);
      input.after(wrap);
      wrap.append(preview, copy);
    });
  }

  function installTranslationTools() {
    document.querySelectorAll(".translate-tool").forEach((panel) => {
      const pairs = JSON.parse(panel.dataset.translationPairs || "[]");
      const button = panel.querySelector("[data-translate-all]");
      const status = panel.querySelector("[data-translate-status]");
      button?.addEventListener("click", () => {
        let count = 0;
        setTone(status, "正在填充目标字段...", "info");
        for (const pair of pairs) {
          const source = field(pair.source);
          const target = field(pair.target);
          if (!source || !target || !source.value.trim() || target.value.trim()) continue;
          target.value = simpleTranslate(source.value);
          target.dispatchEvent(new Event("input", { bubbles: true }));
          count += 1;
        }
        setTone(status, count ? `已填入 ${count} 个目标字段，请人工核对后保存。` : "没有可自动填入的空目标字段。", count ? "success" : "warn");
      });
    });
  }

  function installPublicationTools() {
    document.querySelectorAll(".publication-metadata-tools").forEach((panel) => {
      const status = panel.querySelector("#publication-tool-status");
      panel.querySelector("[data-parse-citation]")?.addEventListener("click", () => {
        const parsed = parseCitation(currentCitationText());
        const count = fillMetadata(parsed, false);
        renderMetadataResult(panel, { metadata: parsed, source: "本地解析" });
        setTone(status, count ? `已解析并填入 ${count} 个空字段。` : "没有解析出可填入的新字段。", count ? "success" : "warn");
      });
      panel.querySelector("[data-metadata-query]")?.addEventListener("click", async () => {
        const query = currentCitationText();
        if (!query) {
          setTone(status, "请先填写 DOI、标题或引用原文。", "warn");
          return;
        }
        const parsed = parseCitation(query);
        let links = buildMetadataLinks(query);
        const id = panel.dataset.publicationId || "";
        if (id) {
          try {
            const response = await fetch(`/api/admin/publications/${id}/metadata-query`);
            const data = await response.json();
            links = {
              crossref_url: data.crossref_url || links.crossref_url,
              openalex_url: data.openalex_url || links.openalex_url,
            };
          } catch {
            // Local links are enough.
          }
        }
        renderMetadataResult(panel, { metadata: parsed, source: "本地解析", ...links, note: "未自动外发数据；如需在线查询，请手动打开链接核对。" });
        setTone(status, "已生成本地解析结果和外部查询链接。", "success");
      });
    });
  }

  function installBulkActionConfirm() {
    document.querySelectorAll("[data-confirm]").forEach((button) => {
      button.addEventListener("click", (event) => {
        if (!confirm(button.dataset.confirm || "确认执行该操作？")) event.preventDefault();
      });
    });
  }

  function installQuickForms() {
    document.querySelectorAll("form[data-quick-submit]").forEach((form) => {
      form.addEventListener("change", () => form.requestSubmit());
    });
  }

  function currentCitationText() {
    return (field("doi")?.value || field("title")?.value || field("source_citation")?.value || field("citation")?.value || "").trim();
  }

  function renderMetadataResult(panel, data) {
    let result = document.getElementById("publication-metadata-result");
    if (!result) {
      result = document.createElement("div");
      result.id = "publication-metadata-result";
      result.className = "publication-metadata-result";
      panel.after(result);
    }
    const metadata = data.metadata || {};
    const rows = ["title", "authors", "venue", "year", "volume", "issue", "pages", "doi", "url", "abstract", "keywords"]
      .filter((name) => metadata[name])
      .map((name) => `<div class="metadata-result-row"><span>${fieldLabel(name)}</span><p>${escapeHtml(metadata[name])}</p><button type="button" data-fill-one="${name}">填入</button></div>`)
      .join("");
    const links = [data.crossref_url && `<a href="${escapeHtml(data.crossref_url)}" target="_blank" rel="noreferrer">Crossref</a>`, data.openalex_url && `<a href="${escapeHtml(data.openalex_url)}" target="_blank" rel="noreferrer">OpenAlex</a>`].filter(Boolean).join("");
    result.hidden = false;
    result.innerHTML = `<div class="metadata-result-head"><strong>论文元数据结果</strong><span>${escapeHtml(data.source || "待核对")}${data.note ? ` · ${escapeHtml(data.note)}` : ""}</span></div>${rows || `<p class="muted">没有解析出可直接填入的字段。</p>`}<div class="metadata-result-actions"><button type="button" data-fill-empty>填入空字段</button><button type="button" data-fill-overwrite>覆盖填入</button>${links}</div>`;
    result.querySelector("[data-fill-empty]")?.addEventListener("click", () => fillMetadata(metadata, false));
    result.querySelector("[data-fill-overwrite]")?.addEventListener("click", () => fillMetadata(metadata, true));
    result.querySelectorAll("[data-fill-one]").forEach((button) => {
      button.addEventListener("click", () => fillMetadata({ [button.dataset.fillOne]: metadata[button.dataset.fillOne] }, true));
    });
  }

  function fillMetadata(metadata, overwrite) {
    let count = 0;
    Object.entries(metadata || {}).forEach(([name, value]) => {
      const input = field(name);
      if (!input || value == null || value === "") return;
      if (!overwrite && input.value.trim()) return;
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      count += 1;
    });
    return count;
  }

  function parseCitation(text) {
    const value = String(text || "").trim();
    const year = value.match(/\b(19|20)\d{2}\b/)?.[0] || "";
    const doi = value.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0]?.replace(/[).,;]+$/, "") || "";
    const parts = value.split(/\.\s+|。/).map((part) => part.trim()).filter(Boolean);
    return {
      authors: parts[0] || "",
      title: parts[1] || "",
      venue: parts[2] || "",
      year,
      doi,
      citation: value,
    };
  }

  function buildMetadataLinks(query) {
    const encoded = encodeURIComponent(query);
    return {
      crossref_url: `https://api.crossref.org/works?query.title=${encoded}&rows=1`,
      openalex_url: `https://api.openalex.org/works?search=${encoded}&per-page=1`,
    };
  }

  function simpleTranslate(text) {
    const dictionary = {
      "首页": "Home",
      "团队": "Team",
      "项目": "Projects",
      "论文": "Publications",
      "甄选论文": "Featured Publications",
      "专利": "Patents",
      "学生": "Students",
      "教学": "Teaching",
      "动态": "News",
      "留言": "Contact",
    };
    const trimmed = String(text || "").trim();
    return dictionary[trimmed] || trimmed;
  }

  function fieldLabel(name) {
    return ({
      title: "标题",
      authors: "作者",
      venue: "期刊/会议",
      year: "年份",
      volume: "卷",
      issue: "期",
      pages: "页码",
      doi: "DOI",
      url: "链接",
      abstract: "摘要",
      keywords: "关键词",
    })[name] || name;
  }

  function field(name) {
    return document.querySelector(`[name="${cssEscape(name)}"]`);
  }

  function setTone(node, message, tone) {
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone || "info";
  }

  function cssEscape(value) {
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char] || char);
  }
})();
