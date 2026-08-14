(function () {
  const button = document.getElementById("back-to-top");
  if (button) {
    const root = document.scrollingElement || document.documentElement;
    const scrollTop = () => window.scrollY || root.scrollTop || document.body.scrollTop || 0;
    const pageScrollable = () => root.scrollHeight > window.innerHeight + 120;
    const update = () => button.classList.toggle("is-visible", scrollTop() > 160 && pageScrollable());
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("load", update, { once: true });
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    update();
  }

  const input = document.getElementById("attachment");
  const picker = document.getElementById("attachment-picker-button");
  const name = document.querySelector(".file-control-name");
  if (input && name) {
    picker?.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      name.textContent = input.files && input.files.length ? input.files[0].name : name.dataset.empty || "未选择文件";
    });
  }
})();
