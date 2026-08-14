import type { Context } from "hono";
import type { AppEnv } from "../types";
import { run } from "./db";

const allowed = new Set(["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "mp4", "webm"]);

export function mediaTypeFromName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "webm"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "file";
}

export function sanitizeFileName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "bin";
  if (!allowed.has(ext)) throw new Error(`不允许上传 .${ext} 文件`);
  const stem = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-").slice(0, 48) || "upload";
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `${stem}-${stamp}.${ext}`;
}

export async function saveUpload(c: Context<AppEnv>, file: File, category = "library") {
  if (!c.env.MEDIA) throw new Error("未绑定 R2 MEDIA。部署前请创建 R2 bucket；本地文件迁移可先放在项目 public/media/ 目录。");
  const key = `${category}/${sanitizeFileName(file.name)}`;
  await c.env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await run(c.env.DB, "INSERT OR REPLACE INTO media_assets (object_key, title, category, mime_type, size) VALUES (?, ?, ?, ?, ?)", [
    key,
    file.name,
    category,
    file.type,
    file.size,
  ]);
  return { key, title: file.name, type: mediaTypeFromName(file.name), size: file.size };
}
