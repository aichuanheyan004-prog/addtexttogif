# Decision Record

Target task: A US English user needs to add captions, labels, or meme text to an existing animated GIF and download an animated GIF result.

Audience/country/language: United States, English-first, desktop and mobile browser users who want a quick no-login tool.

SERP intent and date checked: Tool intent, checked on 2026-07-23 with Google US parameters `hl=en&gl=us&pws=0`. For "add text to gif", observed top results included Ezgif `/add-text`, GIFGIFs `/add-text/`, Gifgit `/gif/add-text-to-gif`, and a YouTube how-to result below the tools. For "add text to animated gif", observed top results included Ezgif, Canva, GIFGIFs, Gifgit, and a Reddit discussion about a GIF text tool. Same-intent variants are merged into the homepage.

Demand evidence: The user-provided screenshot records historical keyword-tool estimates around "add text to gif" with US-first value, low reported difficulty, related terms, and existing competitors. This is treated as historical directional evidence only. Current manual SERP review confirms active tool demand and competitor pages.

Current competitors and gaps: Ezgif is comprehensive but older and server-oriented. Canva/Kapwing-style editors are broader and account/upsell oriented. GIFGIFs and Gifgit are direct tool competitors but have narrower controls or older interaction patterns. The gap is a focused browser-local editor with multi-layer text, frame range control, clear privacy behavior, responsive design, and no output publishing.

Open-source reference from screenshot: `sanidhya711/text-on-gif` was checked as an implementation reference. The npm package is ISC licensed and uses a Node/canvas extraction and re-encoding flow. It is not copied into this product because this site requires browser-local processing, but its high-level frame workflow informed the architecture.

Proposed product/page: Homepage tool at `/` with upload, sample GIF, multi-layer text controls, preview drag, undo/reset, export, progress, errors, cancel, and clear limits. Additional pages are `/how-to/`, `/privacy/`, `/terms/`, and a real `404.html`.

Unique value/data: The site does not collect image data, filenames, text content, or generated outputs. Processing happens locally in the browser using mature open-source GIF libraries.

Risk decision: Allow with controls. Legitimate use is editing GIFs the user owns or is authorized to modify. Controls include no server upload, no public result pages, no content collection, no copyrighted sample media, explicit rights reminder, and realistic browser limits.

Monetization and cost range: Static Vercel hosting with no server processing. No ads or analytics in MVP. Future monetization, if any, must avoid collecting file/text content and must not interfere with the editor.

MVP acceptance criteria: Upload a real animated GIF, decode frames with timing/disposal behavior, preview animation, add multiple text layers, control styling and frame range, drag layer position, undo/reset, export animated GIF at original dimensions, show progress/errors/cancel, and pass desktop/mobile browser checks.

URL/page map:

| URL | Primary task/query cluster | Page type | Index/canonical |
| --- | --- | --- | --- |
| `/` | add text to gif, add text to animated gif, online/free/local GIF caption editor | Tool | Index, canonical `https://www.addtexttogif.net/` |
| `/how-to/` | how to add text to a GIF | Guide | Index, canonical `https://www.addtexttogif.net/how-to/` |
| `/privacy/` | privacy policy for GIF editor | Policy | Index, canonical `https://www.addtexttogif.net/privacy/` |
| `/terms/` | terms for authorized GIF editing | Policy | Index, canonical `https://www.addtexttogif.net/terms/` |
| `404.html` | missing page | Error | Real 404, noindex |

Launch metrics: Task starts, valid GIF decode, export success/failure reason, export time, browser/device issues, GSC indexing and query evidence. MVP does not include analytics scripts, so metrics begin with manual checks and any future privacy-preserving analytics.

Expansion/stop thresholds: Add pages only when GSC or support data shows independent intent. Do not create doorway pages for "free", "online", "animated", or close variants. Stop or merge pages with weak unique value.

Open assumptions: GitHub, Vercel, and DNS authorization may require the user. Current demand was manually reviewed; paid keyword metrics remain estimates.
