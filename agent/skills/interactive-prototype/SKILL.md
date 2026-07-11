---
name: interactive-prototype
description: Build a polished, self-contained, clickable product prototype from a short idea or feature brief. Use when the user wants a high-fidelity UI concept, app mockup, interactive demo, product flow, proof of concept, or something visual they can click through rather than a report or static specification.
---

# Interactive Prototype

Turn a product idea into a convincing single-page prototype that demonstrates the core user experience.

## Workflow

1. Define the demo moment.
   - Identify the user, core job, primary screen, and one memorable success state.
   - Make reasonable product assumptions when details are missing; do not block on minor ambiguity.
   - Keep the prototype focused enough to understand within 60 seconds.

2. Design the interaction model.
   - Include at least three meaningful interactions, such as navigation, filtering, selection, editing, drag-like controls, modal flows, state transitions, or simulated AI output.
   - Make every prominent control functional. Do not render dead buttons or fake inputs.
   - Include realistic sample content and at least one polished empty, loading, success, or error state.

3. Implement `outputs/interactive-prototype/index.html` with `write_file`.
   - Keep HTML, CSS, and JavaScript self-contained.
   - Use inline SVG for icons and graphics. Avoid external dependencies unless essential.
   - Match the visual language to the product domain; do not default to a generic analytics dashboard.
   - Use typography, spacing, color, motion, and subtle elevation for hierarchy. Avoid excessive borders and nested cards.
   - Make the layout responsive and accessible, including visible focus states and keyboard-friendly controls.

4. Validate the experience.
   - Open the HTML with `browser_open_file`.
   - Use `browser_get_dom`, `browser_click`, and `browser_type` to exercise the primary flow.
   - Capture a real screenshot with `browser_screenshot` and inspect the image.
   - Repair overflow, clipped content, broken state changes, weak contrast, visual clutter, and non-functional controls. Re-test after repair.

5. Publish the demo.
   - Publish the HTML as an `html` artifact with preview display.
   - Publish the final screenshot as an inline `image` artifact from its workspace file path.
   - Optionally publish a compact `json` artifact describing screens, interactions, and assumptions when useful for handoff.

## Quality Bar

- Present one coherent product, not a component gallery.
- Make the first viewport immediately understandable and visually distinctive.
- Prefer one strong interaction story over many shallow features.
- Use motion purposefully and respect reduced-motion preferences.
- Do not describe the prototype as finished until the primary interaction has been executed in the browser.

## Final Response

Summarize the product concept, the interactions that work, and the published artifact titles.
