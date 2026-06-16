---
name: html-report
description: Generate a polished self-contained HTML report from user-provided materials, including material analysis, storyline synthesis, implementation, visual screenshot validation, repair, and final HTML plus screenshot artifacts.
---

# HTML Report

Use this skill when the user asks to turn provided materials, notes, data, documents, research, or summaries into a polished HTML report.

## Required Workflow

1. Build the report storyline.
   - Analyze the provided materials: audience, purpose, decision context, key facts, metrics, claims, constraints, and missing information.
   - Do not invent facts. If a claim is uncertain, present it as an assumption or omit it.
   - Start from the main conclusion or user goal.
   - Organize sections into a coherent arc: context, insight, evidence, implications, recommendations or next steps.
   - Prefer specific section titles over generic labels.
   - Convert raw material into synthesized report prose, tables, callouts, and charts where useful.

2. Select a visual theme.
   - Use the user's explicit preference if given.
   - Otherwise choose the theme that best matches the material, audience, and report intent.
   - Default to `executive-light` when no theme signal is clear.
   - Use `read_skill_file` to read `references/themes.md` before implementation and apply the selected theme as a full design system: background, colors, typography scale, spacing, surfaces, chart palette, icon style, and validation checklist.

3. Implement a self-contained HTML file.
   - Use `write_file` to create the report, normally under `outputs/html-report/index.html`; `write_file` creates parent directories, so shell setup is usually unnecessary.
   - Keep CSS and JavaScript inline unless there is a clear reason to split files.
   - Use `read_skill_file` to read `references/dependencies.md` and use the exact CDN URLs listed there for Chart.js and Font Awesome.
   - Use Chart.js for charts and Font Awesome for icons when charts or icons help the report.
   - For other external network dependencies, avoid them unless the user explicitly provided or requested them.
   - Make the layout responsive for desktop and mobile.
   - Use semantic HTML, accessible color contrast, readable typography, and clear visual hierarchy.

4. Validate visually with browser tools.
   - Use `browser_open_file` to open the generated HTML file directly from the sandbox path.
   - Do not start a local HTTP server for preview unless a future runtime explicitly provides a dedicated long-running process tool.
   - Take at least one screenshot.
   - Inspect for blank renders, broken assets, failed Chart.js or Font Awesome loading, overflow, clipped text, overlapping UI, weak contrast, excessive borders, old-fashioned styling, and poor mobile behavior.
   - If the screenshot reveals issues, patch the HTML/CSS and take another screenshot. Iterate until the report looks production-quality.

5. Publish artifacts.
   - Create an `html` artifact for the final report with preview display.
   - Create an `image` artifact for the final screenshot with inline display.
   - If source data tables or generated JSON are important for reuse, create separate artifacts for them.

## Themes

Choose one theme per report unless the user asks for variants. Theme details live in `references/themes.md`.

Theme selection hints:

- Strategy, business review, investor, leadership: `executive-light`.
- Metrics-heavy, product analytics, operations, experiment results: `data-studio`.
- Research synthesis, market narrative, brand/report storytelling: `editorial-impact`.
- Engineering, incident, security, system diagnostics: `dark-command`.

## Chart And Icon Rules

- Use the exact dependency snippets in `references/dependencies.md`.
- Use Chart.js when the material includes quantitative comparisons, trends, composition, or ranked categories.
- Keep charts readable at screenshot size: clear labels, limited series count, visible legends, and sufficient canvas height.
- Match chart colors to the selected theme; do not use Chart.js defaults blindly.
- Use Font Awesome icons sparingly for section anchors, KPI labels, risks, opportunities, recommendations, and source notes.
- Icons should clarify meaning, not decorate every heading.
- If CDN loading fails during screenshot validation, either fix the dependency path or replace the dependency use with inline fallback styles/content.

## Design Guidance

- The report should feel modern, calm, and content-specific, not like a generic dashboard template.
- Use background, spacing, typography, section rhythm, and subtle elevation for hierarchy. Avoid heavy border grids.
- Avoid decorative clutter, gradient blobs, and one-note palettes.
- Use cards only for distinct repeated content or compact evidence blocks; do not nest cards.
- Make charts or metrics explain the story rather than merely decorating the page.
- Ensure long text wraps cleanly and never overlaps buttons, labels, charts, or adjacent sections.

## Final Response

Return a concise summary of what was produced, the storyline used, and the final artifact ids or titles for the HTML report and screenshot.
