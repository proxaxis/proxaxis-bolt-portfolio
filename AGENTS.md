## Markdown Writing Rules

Apply these rules to all Markdown content written for this site (pages, content collections, docs).

- Use `. ` (period followed by a space) instead of `。`
- Use `"` with spaces around it instead of `「」`
- Do not use `・`; express enumerations with `や` or `または` instead
- Use half-width `()` instead of full-width `（）`
- Do not use `**` bold by default

## Vercel Deployment

- Vercel project: `portfolio-v3` (team scope: `team-proxaxis`, Root Directory: `app`)
- Production domain: https://y.hosoda.me
- The project is NOT connected to Git, so pushes to `main` do not auto-deploy.
- This repo (`/ws`) is linked to the project via `.vercel/project.json` (gitignored).
- Deploy commands (run from `/ws`):
  - Preview: `vercel deploy -y --no-wait`
  - Production: `vercel deploy --prod -y --no-wait`
- API proxies for `/zenn`, `/whatistoday`, `/open-meteo` are configured in
  `app/vercel.json` (production) and `app/astro.config.mjs` `vite.server.proxy` (dev).
- `vercel` CLI is authenticated as `proxaxis`; Vercel MCP is connected at user scope
  (`~/.config/devin/mcp_config.json`).
