## Vandekn DNS

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?logo=javascript&logoColor=222222)](https://developer.mozilla.org/docs/Web/JavaScript)
[![DNS over HTTPS](https://img.shields.io/badge/DNS-over_HTTPS-2F6FEB)](https://www.rfc-editor.org/rfc/rfc8484)

________________
## Language: 
1. Vietnamese: [README.md](README.md)
2. English: Here
________________

Vandekn DNS is a DNS-over-HTTPS (DoH) resolver running on Cloudflare Workers. It checks DNS queries against a blocklist, returns NXDOMAIN for blocked domains, and forwards other queries to DoH upstreams.

### Project structure
```text
vandekn-dns
|_ src
|  |_ worker.js        Main project

```

### Features

- Supports DoH queries through `GET /dns-query?dns=...` and `POST /dns-query`.
- Checks domains against a merged blocklist stored in Cloudflare KV.
- Downloads blocklists and whitelists from sources configured in `src/worker.js`; whitelisted domains are removed from the blocklist.
- Caches GET responses and the blocklist in Worker memory.
- Updates the lists daily using the `0 0 * * *` cron trigger, or manually through `GET /update`.
- Forwards queries to Cloudflare DNS and Google DNS over DoH.

### Requirements

- Node.js and npm.
- A Cloudflare account with permission to deploy Workers.
- A Cloudflare KV namespace bound as `ADBLOCK_KV`.

### Install and run locally

```bash
npm ci
npm run dev
```

Wrangler displays the local address when it starts. Open `/` to check that the Worker is running.

### Configure KV

`wrangler.jsonc` declares the `ADBLOCK_KV` binding. Replace its `id` with your KV namespace ID and make sure the namespace exists in the Cloudflare account used by Wrangler.

The Worker reads custom allowed domains from the `WHITELIST` KV key. When updating, it writes the merged blocklist to the `MERGED_BLOCKLIST` key.

### Deploy

```bash
npm run deploy
```

After deployment, configure a hostname or route for the Worker in Cloudflare as needed. `workers_dev` is disabled in `wrangler.jsonc`, so configure a route or hostname to make the Worker accessible.

### API

| Path | Description |
| --- | --- |
| `GET /` | Basic health check; returns `Vandekn DNS is ACTIVE!`. |
| `GET /dns-query` | DoH JSON health check when the `dns` parameter is omitted. |
| `GET /dns-query?dns=<base64url>` | Sends a DNS query encoded as Base64URL. |
| `POST /dns-query` | Sends a DNS query in the request body. |
| `GET /update` | Starts a background blocklist and whitelist update. |

DoH requests return a response with the `application/dns-message` content type. Queries for blocked domains receive an NXDOMAIN response; other queries are forwarded to the upstream DNS resolvers.

### List sources

The blocklist, whitelist, and upstream DNS source URLs are configured in `src/worker.js`. Edit the corresponding arrays there to change the sources.

### Sponsor me
[![Sponsor Me](https://img.shields.io/badge/sponsor-Me-ff69b4?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://donate.protechvn.io.vn)
---

## License
this code license under Mit license in [LICENSE](License)
