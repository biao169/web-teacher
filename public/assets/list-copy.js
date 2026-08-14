(function () {
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

  document.querySelectorAll(".list-copy-scope").forEach((scope) => {
    const isEn = document.documentElement.lang === "en";
    const toolbar = scope.previousElementSibling && scope.previousElementSibling.classList.contains("copy-toolbar")
      ? scope.previousElementSibling
      : document;
    const items = Array.from(scope.querySelectorAll(".list-copy-item"));
    const selectAll = toolbar.querySelector(".list-select-all");
    const copySelected = toolbar.querySelector(".list-copy-selected");
    const status = toolbar.querySelector(".copy-status");

    function setStatus(message) {
      if (!status) return;
      status.textContent = message;
      window.setTimeout(() => { status.textContent = ""; }, 2200);
    }

    items.forEach((item) => {
      item.querySelector(".list-copy-one")?.addEventListener("click", async () => {
        const ok = await copyText(item.dataset.copyText || "");
        setStatus(ok ? (isEn ? "Copied 1 item" : "已复制 1 条") : (isEn ? "Copy failed" : "复制失败"));
      });
    });

    selectAll?.addEventListener("click", () => {
      const checks = items.map((item) => item.querySelector(".list-copy-check")).filter(Boolean);
      const shouldSelect = checks.some((check) => !check.checked);
      checks.forEach((check) => { check.checked = shouldSelect; });
      selectAll.textContent = shouldSelect ? (isEn ? "Unselect all" : "取消全选") : (isEn ? "Select all" : "全选");
    });

    copySelected?.addEventListener("click", async () => {
      const values = items
        .filter((item) => item.querySelector(".list-copy-check")?.checked)
        .map((item) => item.dataset.copyText || "")
        .filter(Boolean);
      if (!values.length) {
        setStatus(isEn ? "Select items first" : "请先选择内容");
        return;
      }
      const ok = await copyText(values.join("\n\n"));
      setStatus(ok ? (isEn ? `Copied ${values.length} items` : `已复制 ${values.length} 条`) : (isEn ? "Copy failed" : "复制失败"));
    });
  });
})();
