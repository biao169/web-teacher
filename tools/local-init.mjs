import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, "data");
const mediaDir = join(root, "public", "media");
const dbPath = join(dataDir, "local.db");
mkdirSync(dataDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });

if (!existsSync(dbPath)) {
  const schema = readFileSync(join(root, "migrations", "0001_initial.sql"), "utf8");
  const seed = readFileSync(join(root, "seed", "demo.sql"), "utf8");
  const sqlPath = join(dataDir, "local-init.sql");
  writeFileSync(sqlPath, `${schema}\n${seed}`);
  try {
    execFileSync("sqlite3", [dbPath, `.read ${sqlPath}`], { stdio: "inherit" });
    console.log(`created ${dbPath}`);
  } catch {
    console.log("未找到 sqlite3 命令。可继续使用 wrangler d1 本地数据库，或手动用 migrations/0001_initial.sql 初始化。");
  }
} else {
  console.log(`${dbPath} already exists`);
}

console.log(`local media directory: ${mediaDir}`);
