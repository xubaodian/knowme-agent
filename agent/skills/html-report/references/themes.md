# HTML Report Theme System

Use this reference after selecting a theme. Each theme is a design system, not a color name.

## Shared Implementation Contract

Implement themes with CSS custom properties so the report has a coherent system:

```css
:root {
  --page-bg: #f7f9fc;
  --surface: #ffffff;
  --surface-muted: #eef3f8;
  --text: #172033;
  --muted: #667085;
  --accent: #2563eb;
  --accent-2: #14b8a6;
  --success: #16a34a;
  --warning: #d97706;
  --danger: #dc2626;
  --line: rgba(23, 32, 51, 0.1);
  --shadow-soft: 0 18px 50px rgba(15, 23, 42, 0.08);
}
```

Baseline layout:

- Page max width: `1120px` to `1240px`.
- Desktop page padding: `40px 32px 64px`.
- Mobile page padding: `24px 16px 40px`.
- Section gap: `28px` to `44px`.
- Card radius: `8px` unless the design has a specific reason to be sharper.
- Avoid visible heavy borders; use background contrast, spacing, and soft shadow for hierarchy.

Baseline typography:

- Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Body: `16px`, line-height `1.65`.
- H1: `clamp(36px, 5vw, 64px)`, line-height `1.02`, weight `720`.
- H2: `clamp(26px, 3vw, 38px)`, line-height `1.15`, weight `700`.
- H3: `20px` to `24px`, line-height `1.25`, weight `680`.
- KPI value: `clamp(30px, 4vw, 48px)`, line-height `1`.
- Caption/meta: `12px` to `13px`, uppercase optional, letter spacing no more than `0.08em`.

Chart container rules:

- Canvas wrapper height: `280px` to `420px`, with explicit `min-height`.
- Use theme chart palette. Avoid default Chart.js colors.
- Legends belong at bottom or right; never let legends overlap charts.

## Theme: executive-light

Default theme for leadership, strategy, business review, investor, boardroom, roadmap, and decision reports.

Design philosophy:

- Quiet authority, strong clarity, boardroom polish.
- Prefer confident whitespace and subtle contrast over decoration.
- Highlight the business point first, then evidence.

Tokens:

- `--page-bg`: `#f5f7fb`
- `--surface`: `#ffffff`
- `--surface-muted`: `#eef3f8`
- `--text`: `#162033`
- `--muted`: `#667085`
- `--accent`: `#2357c6`
- `--accent-2`: `#0f9f8f`
- `--success`: `#138a52`
- `--warning`: `#b7791f`
- `--danger`: `#c2410c`
- `--line`: `rgba(22, 32, 51, 0.1)`
- `--shadow-soft`: `0 20px 60px rgba(15, 23, 42, 0.08)`

Typography:

- H1: `clamp(40px, 5vw, 68px)`, weight `760`.
- H2: `clamp(28px, 3vw, 40px)`.
- Body: `16px`.
- KPI value: `42px` desktop, `32px` mobile.

Composition:

- Hero uses a full-width calm background band, not a card.
- KPI blocks are compact and aligned in a grid.
- Use one primary accent and one secondary accent only.
- Favor concise executive summaries and evidence tables.

Chart palette:

- `#2357c6`, `#0f9f8f`, `#8b5cf6`, `#f59e0b`, `#64748b`.

Icon style:

- Use Font Awesome line/business icons: `fa-chart-line`, `fa-bullseye`, `fa-arrow-trend-up`, `fa-circle-check`, `fa-scale-balanced`.
- Icons should be small, muted, and paired with text.

## Theme: data-studio

Use for analytics, product metrics, experiment analysis, operations, funnels, user behavior, or metrics-heavy reports.

Design philosophy:

- Dense but breathable, analytical, scannable.
- Make data comparison effortless.
- UI should feel like a refined internal analytics studio, not a marketing page.

Tokens:

- `--page-bg`: `#f2f6f9`
- `--surface`: `#ffffff`
- `--surface-muted`: `#e8f1f5`
- `--text`: `#10202b`
- `--muted`: `#5d7180`
- `--accent`: `#0f7ea8`
- `--accent-2`: `#18a67d`
- `--success`: `#16a34a`
- `--warning`: `#d88a16`
- `--danger`: `#d64545`
- `--line`: `rgba(16, 32, 43, 0.11)`
- `--shadow-soft`: `0 16px 44px rgba(8, 47, 73, 0.08)`

Typography:

- H1: `clamp(34px, 4vw, 56px)`, weight `720`.
- H2: `28px` to `34px`.
- Body: `15.5px` to `16px`.
- Table text: `14px`.
- KPI value: `36px` to `44px`.

Composition:

- Use compact metric rows, chart panels, grouped evidence blocks, and sticky section labels only when useful.
- Tables should use zebra surfaces or spacing, not heavy grid borders.
- Use chart annotations and callouts to explain movement.

Chart palette:

- `#0f7ea8`, `#18a67d`, `#7c3aed`, `#f59e0b`, `#ef4444`, `#64748b`.

Icon style:

- Use status and analytic icons: `fa-chart-simple`, `fa-filter`, `fa-gauge-high`, `fa-arrow-trend-up`, `fa-triangle-exclamation`.
- Icons can sit in small colored chips or metric labels.

## Theme: editorial-impact

Use for research synthesis, market narrative, strategic storytelling, brand reports, thought leadership, or qualitative-heavy material.

Design philosophy:

- Narrative first, evidence second, with confident editorial rhythm.
- Use expressive typography and strong section transitions.
- Make the reader feel the argument unfolding.

Tokens:

- `--page-bg`: `#fbf7f1`
- `--surface`: `#fffdf8`
- `--surface-muted`: `#f1e7d8`
- `--text`: `#231f20`
- `--muted`: `#746a61`
- `--accent`: `#9f3a2f`
- `--accent-2`: `#2f6f73`
- `--success`: `#3f7d58`
- `--warning`: `#b56a1c`
- `--danger`: `#a93636`
- `--line`: `rgba(35, 31, 32, 0.12)`
- `--shadow-soft`: `0 22px 64px rgba(67, 46, 28, 0.1)`

Typography:

- H1: `clamp(44px, 6vw, 78px)`, weight `760`.
- H2: `clamp(30px, 4vw, 48px)`.
- Body: `17px`, line-height `1.75`.
- Pull quote: `clamp(26px, 3.5vw, 42px)`.
- Caption: `13px`.

Composition:

- Use narrative bands, pull quotes, annotated evidence cards, and fewer but larger charts.
- Avoid dashboard density.
- Put the story spine in the hero or opening section.

Chart palette:

- `#9f3a2f`, `#2f6f73`, `#d89a2b`, `#6d5b9a`, `#8a7a6a`.

Icon style:

- Use icons sparingly: `fa-quote-left`, `fa-book-open`, `fa-lightbulb`, `fa-compass`, `fa-flag-checkered`.
- Icons can be larger in section openers but should not dominate.

## Theme: dark-command

Use only when requested or when material is technical, incident-oriented, security, infrastructure, operational command, or diagnostic.

Design philosophy:

- Dark technical workspace with high legibility.
- Calm contrast, not neon overload.
- Prioritize status, sequence, evidence, and action.

Tokens:

- `--page-bg`: `#0b0f14`
- `--surface`: `#121821`
- `--surface-muted`: `#1a2330`
- `--text`: `#edf2f7`
- `--muted`: `#9aa7b5`
- `--accent`: `#38bdf8`
- `--accent-2`: `#22c55e`
- `--success`: `#22c55e`
- `--warning`: `#f59e0b`
- `--danger`: `#fb7185`
- `--line`: `rgba(237, 242, 247, 0.12)`
- `--shadow-soft`: `0 24px 70px rgba(0, 0, 0, 0.28)`

Typography:

- H1: `clamp(36px, 5vw, 64px)`, weight `740`.
- H2: `28px` to `38px`.
- Body: `16px`.
- Code/metadata: `13px`, font stack `ui-monospace, SFMono-Regular, Menlo, monospace`.
- KPI value: `38px` to `48px`.

Composition:

- Use status strips, timeline sections, terminal-like metadata blocks, and clear risk/action areas.
- Avoid giant dark cards inside darker page backgrounds; use surface contrast carefully.
- Keep body text bright enough for reading.

Chart palette:

- `#38bdf8`, `#22c55e`, `#a78bfa`, `#f59e0b`, `#fb7185`, `#94a3b8`.

Icon style:

- Use technical/status icons: `fa-terminal`, `fa-shield-halved`, `fa-server`, `fa-bug`, `fa-circle-nodes`, `fa-circle-check`.
- Icons may use accent colors but should stay restrained.

## Screenshot Validation Checklist

After taking screenshots, verify:

- Theme tokens are visibly applied: page background, surface, typography, chart palette, and icons all match.
- H1, H2, body, KPI, caption sizes feel intentional and responsive.
- Text does not overlap charts, icons, tables, or adjacent sections.
- Charts have readable labels and no clipped legends.
- Icon loading works and icons are not empty squares.
- The page has a clear first viewport and enough content rhythm below it.
- Mobile layout remains readable and avoids horizontal scrolling.
