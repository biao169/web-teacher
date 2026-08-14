import type { Context, Next } from "hono";
import type { AppEnv } from "../types";

function emailSet(raw: string) {
  return new Set(
    String(raw || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function attachUser(c: Context<AppEnv>, next: Next) {
  const accessEmail = (c.req.header("Cf-Access-Authenticated-User-Email") || "").toLowerCase();
  const headerToken = c.req.header("X-Local-Admin-Token") || "";
  const cookieToken = cookieValue(c.req.header("Cookie") || "", "local_admin_token");
  const configuredToken = c.env.LOCAL_ADMIN_TOKEN || "";
  const allowed = emailSet(c.env.ADMIN_EMAILS);
  const accessAdmin = Boolean(accessEmail && allowed.has(accessEmail));
  const localAdmin = Boolean(configuredToken && (headerToken === configuredToken || cookieToken === configuredToken));
  c.set("userEmail", accessEmail || (localAdmin ? "local-admin" : ""));
  c.set("isAdmin", accessAdmin || localAdmin);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  if (c.get("isAdmin")) {
    await next();
    return;
  }
  return c.html('<h1>需要管理员权限</h1><p>请使用 Cloudflare Access，或在配置 LOCAL_ADMIN_TOKEN 后进入 <a href="/admin/login">管理员登录</a>。</p>', 403);
}

function cookieValue(header: string, name: string) {
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("=") || "");
  }
  return "";
}
