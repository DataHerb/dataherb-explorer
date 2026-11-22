# DataHerb MCP

A read-only [MCP](https://modelcontextprotocol.io) server for this explorer, as a Cloudflare
Worker with no dependencies. AI assistants (claude.ai, ChatGPT, Claude Desktop, …) add its
`/mcp` URL as a custom connector and can then:

| Tool | |
|---|---|
| `search_datasets` | Search by words (id, name, description, tags, column names), tag or health |
| `get_dataset` | Description, licence, owner, health, jobs, and each file's URL, format and columns |
| `preview_rows` | The first rows of a CSV, NDJSON or JSON file (read with a Range request) |
| `explore_link` | A link that opens the explorer with the files loaded and SQL filled in |
| `list_unhealthy_jobs` | Jobs that are failing, stuck, stale or degraded, and the datasets they feed |

It reads only the built site (`data/catalog.json`, `data/status.json` under `SITE_URL`) and,
for previews, file URLs listed in the catalog. It never fetches a URL a caller passes in.
Responses are cached for five minutes. Hidden datasets are left out, and so is anything the
build would not publish, so an internal catalog stays internal only as long as its site does.

## Turn it on (off by default)

1. Set `SITE_URL` in `wrangler.toml` to your explorer's public URL.
2. Add the repository secrets `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers") and
   `CLOUDFLARE_ACCOUNT_ID`.
3. Set the repository variable `MCP_ENABLED` to `true`. The `Deploy MCP` workflow then deploys
   on changes to `mcp/` and by hand; without the variable it does nothing.
4. Optional, your own address: serve the site on a custom domain and set the repository
   variable `MCP_ROUTE` to `<that host>/mcp*`. The Worker then answers at `https://<host>/mcp`
   next to the site, while every other path stays with the site. The domain's zone must be in
   the same Cloudflare account as the Worker, its DNS record must be proxied (orange cloud),
   and the token needs Zone: Workers Routes Edit and Zone: Read as well. `SITE_URL` (a
   repository variable) overrides the one in `wrangler.toml` without editing it.

The free Workers plan is enough: each call reads two cached JSON files, and previews read at
most 256 KB of one file.

Tests run offline: `node mcp/test.mjs`.
