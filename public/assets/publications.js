(function () {
  const styleSelect = document.getElementById("citation-style");
  const copySelected = document.getElementById("copy-selected-citations");
  const selectAll = document.getElementById("select-all-publications");
  const status = document.getElementById("copy-status");
  const items = Array.from(document.querySelectorAll(".citation-item"));
  const isEn = document.documentElement.lang === "en";

  function selectedStyle() {
    return styleSelect ? styleSelect.value : "gbt";
  }

  function citationFor(item) {
    const style = selectedStyle();
    return item.dataset[`citation${style[0].toUpperCase()}${style.slice(1)}`] || "";
  }

  function updateVisibleText() {
    items.forEach((item) => {
      const text = item.querySelector(".citation-text");
      if (text) text.textContent = citationFor(item);
    });
  }

  async function copyText(text) {
    if (!text.trim()) return false;
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }

  function setStatus(message) {
    if (!status) return;
    status.textContent = message;
    window.setTimeout(() => { status.textContent = ""; }, 2400);
  }

  styleSelect?.addEventListener("change", updateVisibleText);

  items.forEach((item) => {
    item.querySelector(".copy-one-citation")?.addEventListener("click", async () => {
      const ok = await copyText(citationFor(item));
      setStatus(ok ? (isEn ? "Copied 1 citation" : "已复制 1 条引用") : (isEn ? "Copy failed" : "复制失败"));
    });
  });

  selectAll?.addEventListener("click", () => {
    const checks = items.map((item) => item.querySelector(".publication-check")).filter(Boolean);
    const shouldSelect = checks.some((check) => !check.checked);
    checks.forEach((check) => { check.checked = shouldSelect; });
    selectAll.textContent = shouldSelect ? (isEn ? "Unselect all" : "取消全选") : (isEn ? "Select all" : "全选");
  });

  copySelected?.addEventListener("click", async () => {
    const citations = items
      .filter((item) => item.querySelector(".publication-check")?.checked)
      .map(citationFor)
      .filter(Boolean);
    if (!citations.length) {
      setStatus(isEn ? "Select papers first" : "请先选择论文");
      return;
    }
    const ok = await copyText(citations.join("\n\n"));
    setStatus(ok ? (isEn ? `Copied ${citations.length} citations` : `已复制 ${citations.length} 条引用`) : (isEn ? "Copy failed" : "复制失败"));
  });

  updateVisibleText();
})();
