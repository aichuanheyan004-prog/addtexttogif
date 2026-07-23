# AddTextToGif.net

Browser-local Add Text to GIF editor for the US English market.

## Stack

- Vite, React, TypeScript
- `gifuct-js` for GIF parsing and frame decompression
- `gifenc` for browser GIF encoding
- Static HTML pages for the homepage, how-to guide, Privacy, Terms, and 404

## Local Development

```bash
npm.cmd install
npm.cmd run make:sample
npm.cmd run make:og
npm.cmd run dev
```

The editor processes selected GIF files in the browser. Files, filenames, text layers, and output GIFs are not uploaded by the app.

## Checks

```bash
npm.cmd run test
npm.cmd run typecheck
npm.cmd run make:og
npm.cmd run build
node C:/Users/chunk/.codex/skills/gefei-site-builder/scripts/audit_static_site.mjs dist
```

## Launch Notes

The local repository uses `main` and is intended to push to:

```bash
git remote add origin https://github.com/aichuanheyan004-prog/addtexttogif.git
git push -u origin main
```

Create the GitHub repository `aichuanheyan004-prog/addtexttogif` first if it does not exist, then push. This environment did not have `gh`, `GH_TOKEN`, or `GITHUB_TOKEN`, and direct GitHub network access failed during setup.

For Vercel, create a project from this repository with:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

Then add both domains in Vercel:

- `www.addtexttogif.net` as the canonical production domain
- `addtexttogif.net` redirected to `www.addtexttogif.net`

Use the DNS records Vercel shows for the project. After DNS is active, verify `https://www.addtexttogif.net/`, `https://addtexttogif.net/`, `http://www.addtexttogif.net/`, and `http://addtexttogif.net/` all resolve or redirect to the HTTPS `www` canonical host.
