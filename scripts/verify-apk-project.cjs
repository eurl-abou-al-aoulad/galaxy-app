const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const required = [
  "package.json",
  "capacitor.config.ts",
  "src/router.tsx",
  "src/routeTree.gen.ts",
  "src/routes",
  "src/routes/__root.tsx",
  "src/routes/index.tsx",
  "src/components/ui/sonner.tsx",
];

const missing = required.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));

if (missing.length > 0) {
  console.error("\nERROR: نسخة المشروع ناقصة ولا يمكن بناء APK.");
  console.error("الملفات/المجلدات الناقصة:");
  for (const file of missing) console.error(`- ${file}`);
  console.error("\nالحل السريع من داخل مجلد المشروع:");
  console.error("git fetch origin");
  console.error("git reset --hard origin/main");
  console.error("npm install");
  console.error("npm run android:apk:win\n");
  process.exit(1);
}

console.log("Project structure OK for APK build.");