const fs = require("fs");
const path = require("path");

const enPath = path.resolve(__dirname, "../apps/mobile/src/i18n/en.ts");
const rwPath = path.resolve(__dirname, "../apps/mobile/src/i18n/rw.ts");

const en = fs.readFileSync(enPath, "utf8");
let rw = fs.readFileSync(rwPath, "utf8");

const enRegex = /^\s*([a-zA-Z0-9_]+):/gm;
let m;
const enKeys = [];
while ((m = enRegex.exec(en)) !== null) {
  enKeys.push(m[1]);
}

const rwRegex = /^\s*([a-zA-Z0-9_]+):/gm;
const rwKeys = new Set();
while ((m = rwRegex.exec(rw)) !== null) {
  rwKeys.add(m[1]);
}

const missing = enKeys.filter((k) => !rwKeys.has(k));
console.log("Missing count:", missing.length);

let additions = "\n  // --- Automatically aligned keys ---\n";
for (const key of missing) {
  const match = new RegExp(`^\\s*${key}:\\s*([\\s\\S]*?),?$`, "m").exec(en);
  if (match) {
    additions += `  ${key}: ${match[1]},\n`;
  }
}

const idx = rw.lastIndexOf("};");
if (idx !== -1) {
  rw = rw.slice(0, idx) + additions + rw.slice(idx);
  fs.writeFileSync(rwPath, rw, "utf8");
  console.log("Updated rw.ts successfully!");
}
