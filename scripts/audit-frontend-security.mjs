import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checks = [
  ["untrusted HTML injection sink", /dangerouslySetInnerHTML\s*=|\.innerHTML\s*=|\.outerHTML\s*=|\binsertAdjacentHTML\s*\(/],
  ["runtime string evaluation", /\beval\s*\(|\bnew\s+Function\s*\(/],
  ["embedded private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["embedded secret-like token", /\b(?:ghp_|gho_|github_pat_|sk-proj-)[A-Za-z0-9_\-]{16,}/],
];

export function checkFrontendText(text) {
  return checks.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

function visit(folder, findings, base) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) visit(path, findings, base);
    else if (entry.isFile() && [".ts", ".tsx", ".js", ".jsx"].includes(extname(path))) {
      for (const reason of checkFrontendText(readFileSync(path, "utf8"))) {
        // Never echo suspect source contents, which may themselves be credentials.
        findings.push({ file: relative(base, path), reason });
      }
    }
  }
}

export function auditFrontendSource(base) {
  const findings = [];
  visit(join(base, "src"), findings, base);
  return findings;
}

export function findPublicSourceMaps(dist) {
  const findings = [];
  function search(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) search(path);
      else if (entry.isFile() && entry.name.endsWith(".map")) findings.push(path);
    }
  }
  search(dist);
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(".");
  const issues = auditFrontendSource(root);
  if (process.argv.includes("--dist")) {
    for (const path of findPublicSourceMaps(join(root, "dist"))) {
      issues.push({ file: relative(root, path), reason: "publicly deployed source map" });
    }
  }
  for (const { file, reason } of issues) console.error(`Security audit: ${file} — ${reason}`);
  if (issues.length) process.exitCode = 1;
}
