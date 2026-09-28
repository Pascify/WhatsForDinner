/**
 * Enforces the conventions in CLAUDE.md that a linter cannot see.
 *
 *   pnpm check:rules
 *
 * Every rule here exists because it was broken at least once.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const failures: string[] = [];
const fail = (file: string, line: number | undefined, message: string) =>
  failures.push(`${relative(ROOT, file)}${line ? `:${line}` : ""}  ${message}`);

function walk(dir: string, match: (path: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path, match));
    else if (match(path)) found.push(path);
  }
  return found;
}

const textFiles = walk(ROOT, (path) => /\.(ts|tsx|mts|md|css|ya?ml|json)$/.test(path));

// 1. No em dashes, anywhere. Rewrite with a comma, colon, period or plain hyphen.
for (const file of textFiles) {
  // AGENTS.md is rewritten by `next dev`, so its wording is not ours to fix.
  if (/check-rules\.mts|pnpm-lock\.yaml|AGENTS\.md$/.test(file)) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (line.includes("—")) fail(file, index + 1, "em dash: use a comma, colon or hyphen");
    });
}

// 2. Every environment variable the code reads has to be listed in .env.example.
const IMPLICIT = new Set(["NODE_ENV", "CI", "VERCEL", "VERCEL_ENV", "NEXT_TELEMETRY_DISABLED"]);
const documented = new Set(
  readFileSync(join(ROOT, ".env.example"), "utf8")
    .split("\n")
    .map((line) => line.split("=")[0].trim())
    .filter(Boolean),
);

for (const file of walk(join(ROOT, "src"), (path) => /\.(ts|tsx)$/.test(path)).concat(
  walk(join(ROOT, "scripts"), (path) => path.endsWith(".mts")),
)) {
  const contents = readFileSync(file, "utf8");
  for (const match of contents.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    const name = match[1];
    if (!IMPLICIT.has(name) && !documented.has(name)) {
      fail(file, undefined, `${name} is read here but missing from .env.example`);
    }
  }
}

// 3. Server actions are reachable by direct POST, so each file must check the session itself.
// auth.ts is the exception: logging in is what happens before there is a session.
const actionsDir = join(ROOT, "src/app/actions");
for (const file of walk(actionsDir, (path) => path.endsWith(".ts") && !path.endsWith("auth.ts"))) {
  const contents = readFileSync(file, "utf8");
  if (!contents.includes('"use server"'))
    fail(file, undefined, 'missing the "use server" directive');
  if (!contents.includes("currentUser")) {
    fail(file, undefined, "no session check: every server action must verify the session itself");
  }
}

// 4. A test that needs a real database belongs in the integration suite, by name.
for (const file of walk(join(ROOT, "src"), (path) => /\.test\.tsx?$/.test(path))) {
  const contents = readFileSync(file, "utf8");
  const needsMongo = contents.includes("startMongo") || contents.includes("mongodb-memory-server");
  if (needsMongo && !file.endsWith(".integration.test.ts")) {
    fail(file, undefined, "uses a real database: name it *.integration.test.ts");
  }
  if (contents.includes("@testing-library/react") && !file.endsWith(".dom.test.tsx")) {
    fail(file, undefined, "renders components: name it *.dom.test.tsx");
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} rule violation(s):\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("\nThese are the conventions in CLAUDE.md.\n");
  process.exit(1);
}

console.log("✓ repo rules pass");
