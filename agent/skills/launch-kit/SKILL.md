---
name: launch-kit
description: Create a cohesive product launch kit with a branded interactive microsite, reusable social visual, launch copy, and asset manifest. Use when the user wants to announce a product, feature, event, campaign, internal initiative, or creative concept with coordinated visual and written materials rather than a report.
---

# Launch Kit

Transform a short launch brief into a cohesive, presentation-ready campaign package with multiple reusable artifacts.

## Workflow

1. Establish the launch idea.
   - Identify the audience, promise, proof, tone, launch moment, and primary call to action.
   - Create one concise campaign concept and one memorable headline.
   - Treat missing factual claims as placeholders or omit them; never fabricate customer quotes, metrics, awards, or partnerships.

2. Define a compact visual system.
   - Choose a distinctive palette, typography style, shape language, and graphic motif appropriate to the subject.
   - Keep the system consistent across the microsite and social visual.
   - Avoid generic gradient blobs, stock-photo dependence, excessive borders, and unrelated decorative icons.

3. Create the launch package.
   - Write `outputs/launch-kit/index.html`: a self-contained interactive microsite with hero, value proposition, proof or feature moments, CTA, and one delightful interaction.
   - Write `outputs/launch-kit/social-card.svg`: a polished 1200×630 share visual using the same campaign system.
   - Write `outputs/launch-kit/launch-copy.md`: headline options, short announcement, social post, internal announcement, and CTA variants.
   - Write `outputs/launch-kit/manifest.json`: campaign concept, audience, tone, palette, artifact paths, and any factual placeholders.
   - Use inline CSS, JavaScript, and SVG. Do not depend on external assets unless supplied by the user.

4. Validate the package.
   - Open the microsite with `browser_open_file`, exercise its primary interaction, and inspect the DOM.
   - Capture and inspect a real screenshot.
   - Open the SVG with `browser_open_file` and capture it to verify composition, safe margins, text wrapping, and contrast.
   - Repair any broken controls, overflow, weak hierarchy, inconsistent branding, or unusable copy.

5. Publish deliverables.
   - Publish the microsite as an `html` preview artifact.
   - Publish the social card as an inline `image` artifact from `social-card.svg`.
   - Publish the copy as a `markdown` artifact and the manifest as a `json` artifact.
   - Publish the final microsite screenshot as an inline `image` artifact.

## Quality Bar

- Make the package feel like one campaign, not unrelated generated files.
- Ensure the headline is readable at a glance and the CTA is specific.
- Prefer bold, controlled art direction over template-like card grids.
- Make all text editable in the source artifacts.
- Verify both the microsite and social visual before publishing.

## Final Response

Summarize the campaign concept and list the published microsite, social visual, copy, manifest, and screenshot artifacts.
