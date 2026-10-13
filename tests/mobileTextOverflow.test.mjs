import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("active shift header can shrink and wrap creator names", () => {
    const css = source("../src/pages/OpenShiftOverview.tsx");
    assert.match(css, /> div:first-child \{ min-width: 0; max-width: 100%; \}/);
    assert.match(css, /const HeaderMeta = styled\.p`[\s\S]*?overflow-wrap: anywhere;/);
});

test("ticket creator metadata truncates without forcing horizontal overflow", () => {
    const css = source("../src/components/TicketListItem.tsx");
    assert.match(css, /<CreatedAt title=\{createdBy \?\? undefined\}>/);
    assert.match(css, /const CreatedAt = styled\.small`[\s\S]*?text-overflow: ellipsis;/);
    assert.match(css, /const RightInfo = styled\.div`[\s\S]*?min-width: 0;/);
    assert.match(css, /const RightInfoText = styled\.span`[\s\S]*?min-width: 0;/);
});

test("ticket sidebar and ticket list allow flex children to shrink", () => {
    const css = source("../src/components/TicketSidebar.tsx");
    assert.match(css, /const SidebarContainer = styled\.aside`\s*min-width: 0;/);
    assert.match(css, /const TicketList = styled\.div`\s*min-width: 0;/);
});
