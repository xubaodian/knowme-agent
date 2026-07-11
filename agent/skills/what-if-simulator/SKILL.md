---
name: what-if-simulator
description: Create an interactive what-if simulator that turns assumptions into adjustable inputs, live calculated outcomes, scenario comparisons, and sensitivity views. Use for pricing, growth, staffing, capacity, budgeting, unit economics, operations, prioritization, or any decision where users want to explore tradeoffs instead of reading a report.
---

# What-if Simulator

Build an interactive decision tool that makes assumptions visible and lets users explore consequences instantly.

## Workflow

1. Formalize the model.
   - Extract the decision, controllable inputs, fixed assumptions, formulas, outputs, units, and constraints.
   - When inputs are incomplete, choose clearly labeled demonstration assumptions rather than inventing hidden facts.
   - Keep the model explainable. Prefer a small transparent model over false precision.

2. Create `outputs/what-if-simulator/model.json`.
   - Record every input with label, unit, minimum, maximum, step, default, and rationale.
   - Record formulas in readable expressions and include a short limitations note.

3. Implement `outputs/what-if-simulator/index.html` with `write_file`.
   - Keep HTML, CSS, and JavaScript self-contained.
   - Provide sliders or numeric inputs with synchronized values and immediate recalculation.
   - Include baseline versus current comparison, two or three named presets, and a reset action.
   - Show the most decision-relevant outputs prominently and explain why they changed.
   - Include at least one live sensitivity or scenario visualization using SVG, Canvas, or CSS; do not require an external chart library.
   - Use a modern tool-like layout with soft surfaces and minimal borders. Make it responsive and keyboard accessible.

4. Test the model and interaction.
   - Use `run_node` or `run_python` to independently check representative formula outputs against the defaults and one changed scenario.
   - Open the HTML with `browser_open_file`.
   - Exercise a preset and at least one input using browser tools; verify that outputs update.
   - Capture and inspect a screenshot. Repair confusing labels, clipped content, invalid ranges, stale calculations, and poor visual balance.

5. Publish artifacts.
   - Publish the simulator as an `html` preview artifact.
   - Publish `model.json` as a `json` artifact for transparency and reuse.
   - Publish the final screenshot as an inline `image` artifact.

## Model Rules

- Never hide material assumptions.
- Preserve units through every formula and label.
- Avoid percentages without an explicit basis.
- Clamp or validate impossible values and explain constraints near the control.
- Distinguish observed inputs, user assumptions, and derived outputs visually.

## Final Response

State the decision modeled, important assumptions, tested interactions, and published artifact titles.
