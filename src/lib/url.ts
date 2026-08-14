const routeMap: Record<string, string> = {
  home: "/",
  team: "/team",
  publications: "/publications",
  featured_publications: "/featured-publications",
  projects: "/projects",
  patents: "/patents",
  students: "/students",
  courses: "/courses",
  news: "/news",
  news_list: "/news",
  contact: "/contact",
};

export function routeUrl(name: unknown, fragment = "") {
  const base = routeMap[String(name || "")] || "/";
  return fragment ? `${base}#${fragment}` : base;
}

export function mediaUrl(key: unknown, env: { PUBLIC_MEDIA_BASE_URL?: string }) {
  const clean = String(key || "").replace(/^\/+/, "");
  if (!clean) return "";
  const base = String(env.PUBLIC_MEDIA_BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}/${clean}` : `/media/${clean}`;
}
