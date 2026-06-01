# HTML Report Dependencies

Use these exact CDN snippets when the report needs charts or icons. Do not improvise package names or paths.

## Chart.js

Use Chart.js for quantitative comparisons, trends, composition, ranking, or compact metric visualization.

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
```

Required checks:

- After browser navigation, verify `window.Chart` exists.
- If charts are blank, confirm the canvas has stable width/height and the chart code runs after DOM load.
- Set explicit chart colors from the selected theme; do not rely on Chart.js defaults.
- Keep chart options responsive and screenshot-friendly:

```js
options: {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "bottom" },
    tooltip: { enabled: true }
  }
}
```

## Font Awesome

Use Font Awesome for meaningful section anchors, KPI labels, risk/opportunity markers, recommendations, sources, and navigation cues.

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">
```

Example icon usage:

```html
<i class="fa-solid fa-chart-line" aria-hidden="true"></i>
<span class="sr-only">Trend</span>
```

Required checks:

- After screenshot, verify icons render as icons, not empty squares or raw text.
- Use `aria-hidden="true"` for decorative icons and visible text labels for meaning.
- Do not decorate every heading. Icons should clarify structure or status.

## Dependency Failure Fallback

If CDN loading fails during screenshot validation:

1. Check the exact URL against this reference.
2. Ensure the generated HTML is loaded with network access.
3. If still unavailable, remove dependency usage and replace with inline fallback content:
   - For charts: static HTML/SVG table or simple CSS bars.
   - For icons: text labels or small inline SVGs.
