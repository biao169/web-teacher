const allowedTags = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h2",
  "h3",
  "h4",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "span",
  "strong",
  "u",
  "ul",
]);

const allowedAttrs = new Set(["alt", "class", "data-align", "data-float", "href", "src", "target", "title"]);

export function sanitizeHtml(input: unknown) {
  let html = String(input || "");
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  return html.replace(/<\/?([a-z0-9-]+)\b([^>]*)>/gi, (full, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    const closing = full.startsWith("</");
    if (!allowedTags.has(tag)) return "";
    if (closing) return `</${tag}>`;
    if (tag === "br") return "<br>";
    const attrs = sanitizeAttrs(tag, rawAttrs);
    return `<${tag}${attrs ? ` ${attrs}` : ""}>`;
  });
}

export function stripHtml(input: unknown) {
  return String(input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeAttrs(tag: string, rawAttrs: string) {
  const attrs: string[] = [];
  const attrRe = /([a-z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;
  for (const match of rawAttrs.matchAll(attrRe)) {
    const name = match[1].toLowerCase();
    if (!allowedAttrs.has(name)) continue;
    let value = match[2] ?? match[3] ?? match[4] ?? "";
    if ((name === "href" || name === "src") && !safeUrl(value)) continue;
    if (name === "target" && value !== "_blank") continue;
    if (name === "class") value = sanitizeClass(value);
    if (!value && name !== "alt") continue;
    attrs.push(`${name}="${escapeAttr(value)}"`);
  }
  if (tag === "a" && attrs.some((attr) => attr.startsWith("href="))) {
    attrs.push('rel="noreferrer"');
  }
  return attrs.join(" ");
}

function safeUrl(value: string) {
  const text = value.trim().replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (!text) return false;
  if (/^(https?:|mailto:|\/media\/|\/assets\/|#)/i.test(text)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(text) && !text.startsWith("//");
}

function sanitizeClass(value: string) {
  const allowed = new Set(["news-pdf-block", "news-pdf-inline", "rich-content"]);
  return value
    .split(/\s+/)
    .filter((item) => allowed.has(item))
    .join(" ");
}

function escapeAttr(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
