// One-time local setup: env file and services. Run with `npm run setup`.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  console.log("✓ .env.local already exists, leaving it untouched");
} else {
  copyFileSync(".env.example", ".env.local");
  console.log("✓ Created .env.local from .env.example");
}

console.log("→ Starting Qdrant (docker compose)…");
execSync("docker compose up -d --wait", { stdio: "inherit" });
console.log("✓ Qdrant ready: http://localhost:6333/dashboard");
console.log("\nNext: npm run dev");
