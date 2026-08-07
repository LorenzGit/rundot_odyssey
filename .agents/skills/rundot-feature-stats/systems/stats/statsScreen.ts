// Reference stats-screen renderer (vanilla DOM).
//
// Consumes statsSys.formattedEntries() — all ordering, labeling, and number
// formatting live in the stats registry, so this file is pure presentation.
// Use it as-is in a DOM game, or treat it as the spec when re-implementing
// in the host's UI framework (see README "UI adaptation").
//
// Styling contract (see stats.css): .stat-section header divs, .stat-row
// flex rows containing .stat-label / .stat-value spans.

import type { FormattedEntry } from "./stats";

/**
 * Clear `container` and fill it with one row per registry entry, inserting
 * a section header whenever the entry's `section` changes. Idempotent —
 * call it every time the stats screen opens so values are always current.
 * Null-safe: missing container or system is a no-op.
 *
 * @param container e.g. document.getElementById('stats-list')
 * @param statsSys from createStats()
 */
export function renderStatsList(
    container: HTMLElement | null,
    statsSys: { formattedEntries(): FormattedEntry[] } | null | undefined,
): void {
    if (!container || !statsSys) return;
    container.innerHTML = "";
    let currentSection: string | undefined;
    for (const entry of statsSys.formattedEntries()) {
        if (entry.section && entry.section !== currentSection) {
            currentSection = entry.section;
            const hdr = document.createElement("div");
            hdr.className = "stat-section";
            hdr.textContent = entry.section;
            container.appendChild(hdr);
        }
        const row = document.createElement("div");
        row.className = "stat-row";
        const lbl = document.createElement("span");
        lbl.className = "stat-label";
        lbl.textContent = entry.label;
        const val = document.createElement("span");
        val.className = "stat-value";
        val.textContent = entry.formatted;
        row.appendChild(lbl);
        row.appendChild(val);
        container.appendChild(row);
    }
}
