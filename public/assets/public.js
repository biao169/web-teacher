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
        if (status) status.textContent = "请先选择条目";
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

  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.(".citation-copy-one");
    if (!button) return;
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

  if (selectAll) {
    document.addEventListener("change", (event) => {
      if (!event.target.matches?.(".copy-check")) return;
      const checks = citationChecks();
      selectAll.checked = checks.length > 0 && checks.every((check) => check.checked);
    });
  }

  const setupFrontLazyLoading = () => {
    const roots = Array.from(document.querySelectorAll("[data-front-lazy]"));
    if (!roots.length) return;
    let observer = null;
    const observePager = (pager) => {
      if (observer && pager) observer.observe(pager);
    };
    const loadRoot = async (root) => {
      if (root.dataset.loading === "1") return;
      const pager = root.querySelector("[data-lazy-pager]");
      const next = pager?.querySelector("[data-lazy-next]");
      const list = root.querySelector("[data-lazy-list]");
      if (!pager || !next || !list) return;
      root.dataset.loading = "1";
      root.classList.add("is-loading");
      root.classList.remove("has-load-error");
      next.setAttribute("aria-disabled", "true");
      try {
        const url = new URL(next.getAttribute("href"), window.location.href);
        url.searchParams.set("partial", "items");
        const response = await fetch(url.toString(), { headers: { "x-requested-with": "fetch", "accept": "text/html" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        const newList = doc.querySelector("[data-lazy-list]");
        const newPager = doc.querySelector("[data-lazy-pager]");
        if (!newList) throw new Error("Missing lazy list");
        const currentEmpty = list.querySelector(":scope > .empty");
        if (currentEmpty && newList.children.length) currentEmpty.remove();
        Array.from(newList.children).forEach((child) => list.appendChild(document.importNode(child, true)));
        if (newPager) {
          const importedPager = document.importNode(newPager, true);
          pager.replaceWith(importedPager);
          observePager(importedPager);
        } else {
          pager.remove();
        }
        refreshVisibleCitations();
      } catch (error) {
        next.removeAttribute("aria-disabled");
        root.classList.add("has-load-error");
      } finally {
        root.dataset.loading = "0";
        root.classList.remove("is-loading");
      }
    };
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) loadRoot(entry.target.closest("[data-front-lazy]"));
        });
      }, { rootMargin: "640px 0px" });
      roots.forEach((root) => {
        const pager = root.querySelector("[data-lazy-pager]");
        if (pager) observer.observe(pager);
      });
    }
    roots.forEach((root) => {
      root.addEventListener("click", (event) => {
        const next = event.target.closest?.("[data-lazy-next]");
        if (!next) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        loadRoot(root);
      });
    });
  };

  setupFrontLazyLoading();

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
      fallback.setAttribute("aria-label", img.getAttribute("alt") || "照片");
      fallback.textContent = img.dataset.avatarLabel || img.getAttribute("alt") || "?";
      img.replaceWith(fallback);
    };
    img.addEventListener("error", replaceMissingAvatar, { once: true });
    if (img.complete && img.naturalWidth === 0) replaceMissingAvatar();
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
  });

  const setupNewsPdfEmbeds = () => {
    const pdfjsVersion = "20260827-news-pdf-inline";
    const pdfjsLibUrl = `/assets/vendor/pdfjs/pdf.mjs?v=${pdfjsVersion}`;
    const pdfjsWorkerUrl = `/assets/vendor/pdfjs/pdf.worker.mjs?v=${pdfjsVersion}`;
    let pdfjsPromise = null;
    const iconOpen = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4h6v6m0-6-9 9"/><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"/></svg>';
    const iconDownload = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/></svg>';
    const iconNotice = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 9v4m0 4h.01"/><path d="M10.3 4.4 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0Z"/></svg>';
    const isPdfUrl = (value) => /\.pdf(?:[?#]|$)/i.test(String(value || ""));
    const pdfSourceForViewer = (href) => {
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return "";
        if (!isPdfUrl(url.pathname + url.search + url.hash)) return "";
        return `${url.pathname}${url.search}${url.hash}`;
      } catch {
        return "";
      }
    };
    const mediaKeyFromSource = (src) => {
      try {
        const url = new URL(src, window.location.href);
        const path = decodeURIComponent(url.pathname || "");
        if (!path.startsWith("/media/")) return "";
        return path.slice("/media/".length);
      } catch {
        return "";
      }
    };
    const pdfDownloadHref = (src) => {
      const key = mediaKeyFromSource(src);
      if (!key) return src;
      const params = new URLSearchParams({ key });
      return `/media/pdf-download?${params.toString()}`;
    };
    const getPdfJs = () => {
      if (!pdfjsPromise) {
        pdfjsPromise = import(pdfjsLibUrl).then((pdfjs) => {
          pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
          return pdfjs;
        });
      }
      return pdfjsPromise;
    };
    const renderPdfPage = async (pageBox) => {
      if (!pageBox || pageBox.dataset.rendered === "1" || pageBox.dataset.rendering === "1") return;
      const pdf = pageBox._pdfDocument;
      const pageNumber = Number(pageBox.dataset.pageNumber || 0);
      if (!pdf || !pageNumber) return;
      pageBox.dataset.rendering = "1";
      pageBox.classList.add("is-rendering");
      try {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const parentWidth = Math.max(260, Math.floor(pageBox.parentElement?.clientWidth || pageBox.clientWidth || 760));
        const scale = parentWidth / Math.max(1, baseViewport.width);
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext("2d", { alpha: false });
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({ canvasContext: context, viewport }).promise;
        pageBox.replaceChildren(canvas);
        pageBox.dataset.rendered = "1";
        pageBox.classList.add("is-rendered");
      } catch {
        pageBox.classList.add("has-error");
      } finally {
        pageBox.dataset.rendering = "0";
        pageBox.classList.remove("is-rendering");
      }
    };
    const observePdfPages = (viewer, pdf, pageBoxes) => {
      pageBoxes.forEach((pageBox) => { pageBox._pdfDocument = pdf; });
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            renderPdfPage(entry.target);
          });
        }, { rootMargin: "900px 0px" });
        pageBoxes.forEach((pageBox) => observer.observe(pageBox));
      } else {
        pageBoxes.forEach((pageBox, index) => window.setTimeout(() => renderPdfPage(pageBox), index * 80));
      }
      viewer._pdfPageBoxes = pageBoxes;
    };
    const loadViewer = async (viewer) => {
      if (!viewer || viewer.dataset.pdfLoaded === "1") return;
      const src = pdfSourceForViewer(viewer.dataset.pdfSrc || "");
      const pages = viewer.querySelector("[data-pdf-pages]");
      if (!src || !pages) {
        viewer.remove();
        return;
      }
      viewer.dataset.pdfLoaded = "1";
      viewer.classList.add("is-loading");
      try {
        const pdfjs = await getPdfJs();
        const pdf = await pdfjs.getDocument({ url: src, withCredentials: true }).promise;
        const count = Math.max(1, Number(pdf.numPages || 1));
        pages.innerHTML = "";
        const boxes = [];
        for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
          const pageBox = document.createElement("div");
          pageBox.className = "news-pdf-page";
          pageBox.dataset.pageNumber = String(pageNumber);
          pageBox.innerHTML = '<span class="news-pdf-page-skeleton"></span>';
          pages.appendChild(pageBox);
          boxes.push(pageBox);
        }
        viewer.classList.remove("is-loading", "has-load-warning");
        viewer.classList.add("is-loaded");
        observePdfPages(viewer, pdf, boxes);
      } catch {
        viewer.classList.remove("is-loading");
        viewer.classList.add("has-load-warning");
      }
    };
    const makeViewer = (url, title) => {
      const src = pdfSourceForViewer(url);
      if (!src) return null;
      const label = citationEscapeHtml(title || "PDF");
      const originalHref = citationEscapeHtml(src);
      const downloadHref = citationEscapeHtml(pdfDownloadHref(src));
      const section = document.createElement("section");
      section.className = "news-pdf-section news-pdf-section-inline";
      section.dataset.pdfViewer = "";
      section.dataset.pdfSrc = src;
      section.innerHTML = `<div class="news-pdf-toolbar"><a class="news-pdf-icon-button" href="${originalHref}" target="_blank" rel="noreferrer noopener" aria-label="Open PDF" title="Open PDF">${iconOpen}</a><a class="news-pdf-icon-button" href="${downloadHref}" aria-label="Download PDF" title="Download PDF">${iconDownload}</a></div><div class="news-pdf-pages" data-pdf-pages><div class="news-pdf-placeholder" aria-label="Loading PDF"></div></div><div class="news-pdf-warning" role="status" title="PDF preview failed">${iconNotice}</div>`;
      section.querySelectorAll("a").forEach((action) => action.setAttribute("data-no-instant", ""));
      return section;
    };
    document.querySelectorAll(".article-content a[href]").forEach((link) => {
      const href = link.getAttribute("href") || "";
      if (link.dataset.pdfUpgraded === "1" || !isPdfUrl(href) || link.closest(".news-pdf-section")) return;
      const viewer = makeViewer(href, link.textContent.trim() || href);
      if (!viewer) return;
      link.dataset.pdfUpgraded = "1";
      const anchorBlock = link.closest("p, figure, div") || link;
      const hasOnlyThisLink = anchorBlock !== link
        && anchorBlock.querySelectorAll("a").length === 1
        && (anchorBlock.textContent || "").trim() === (link.textContent || "").trim()
        && !anchorBlock.querySelector("img, video, audio, iframe, object, embed");
      if (hasOnlyThisLink) {
        anchorBlock.replaceWith(viewer);
      } else {
        link.classList.add("news-pdf-source-link");
        anchorBlock.insertAdjacentElement("afterend", viewer);
      }
    });
    const viewers = Array.from(document.querySelectorAll("[data-pdf-viewer]"));
    if (!viewers.length) return;
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          loadViewer(entry.target);
        });
      }, { rootMargin: "520px 0px" });
      viewers.forEach((viewer) => observer.observe(viewer));
    } else {
      viewers.forEach(loadViewer);
    }
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        document.querySelectorAll(".news-pdf-page.is-rendered").forEach((pageBox) => {
          pageBox.dataset.rendered = "0";
          pageBox.classList.remove("is-rendered");
          pageBox.innerHTML = '<span class="news-pdf-page-skeleton"></span>';
          renderPdfPage(pageBox);
        });
      }, 180);
    }, { passive: true });
  };

  setupNewsPdfEmbeds();

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
