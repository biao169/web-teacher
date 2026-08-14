(() => {
  const buttons = Array.from(document.querySelectorAll("[data-summary-toggle]"));
  if (!buttons.length) return;

  const isOverflowing = (summary) => {
    if (!summary) return false;
    const previousExpanded = summary.closest(".person-card")?.classList.contains("is-summary-expanded");
    if (previousExpanded) return true;
    return summary.scrollHeight > summary.clientHeight + 2;
  };

  const syncButton = (button) => {
    const summary = document.getElementById(button.getAttribute("aria-controls"));
    if (!summary || !isOverflowing(summary)) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    const expanded = button.dataset.expanded === "true";
    button.textContent = expanded ? button.dataset.less : button.dataset.more;
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  buttons.forEach((button) => {
    syncButton(button);
    button.addEventListener("click", () => {
      const card = button.closest(".person-card");
      const expanded = button.dataset.expanded !== "true";
      button.dataset.expanded = expanded ? "true" : "false";
      if (card) card.classList.toggle("is-summary-expanded", expanded);
      syncButton(button);
    });
  });

  window.addEventListener("resize", () => buttons.forEach(syncButton), { passive: true });
})();
