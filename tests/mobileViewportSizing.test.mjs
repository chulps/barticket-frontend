import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("page grid uses a shrinkable track and the app root fits viewport", () => {
  const css = read("../src/index.css");
  assert.match(css, /body\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /#root\s*\{\s*min-width: 0;\s*width: 100%;/);
});

test("dashboard grid and sidebar are width-constrained", () => {
  const dashboard = read("../src/pages/Dashboard.tsx");
  const sidebar = read("../src/components/TicketSidebar.tsx");
  assert.match(dashboard, /grid-template-columns: var\(--space-6\) minmax\(0, 1fr\);/);
  assert.match(sidebar, /const SidebarContainer = styled\.aside`\s*min-width: 0;\s*width: 100%;\s*max-width: 100%;/);
});

test("ticket buttons do not inherit global nowrap and metadata is truncated", () => {
  const item = read("../src/components/TicketListItem.tsx");
  assert.match(item, /const Container = styled\(motion\.button\)[\s\S]*?white-space: normal;/);
  assert.match(item, /const CreatedAt = styled\.small`[\s\S]*?text-overflow: ellipsis;/);
});
