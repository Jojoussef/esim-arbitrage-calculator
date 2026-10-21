# Deployment notes

## Current state

| Item | Value |
|---|---|
| Repository | https://github.com/Jojoussef/esim-arbitrage-calculator |
| Pages source | `gh-pages` branch, path `/` (legacy branch mode) |
| Primary URL | https://youssef-benatti.me/esim-arbitrage-calculator/ |
| Short vanity URL | https://youssef-benatti.me/esim/ |
| GitHub-hosted URL | https://jojoussef.github.io/esim-arbitrage-calculator/ |
| Mirror repo | `Jojoussef/Jojoussef.github.io` → `/esim/` (owns the `youssef-benatti.me` CNAME) |
| SSL | ✅ live — valid cert, apex + www, expires 7 May 2027 |
| CI | `.github/workflows/deploy.yml` — build + check + validate + publish on every push to `main` |

The `gh-pages` branch and both URLs are served by GitHub Pages, reached
through Namecheap's TLS-terminating proxy for the custom domain. The
repository `Jojoussef/Jojoussef.github.io` holds the CNAME that binds the
custom domain, so the build is mirrored there at `/esim/` on every deploy.

---

## ✅ SSL is live

**Status: working.** The custom domain serves the whole site over a valid
HTTPS connection.

```
https://youssef-benatti.me/esim-arbitrage-calculator/   -> 200
https://youssef-benatti.me/esim/                        -> 200 (mirror)
```

Certificate in use:

```
subject : /CN=youssef-benatti.me
issuer  : /C=US/O=SSL Corporation/CN=SSL.com TLS Issuing RSA CA R1
SANs    : DNS:youssef-benatti.me, DNS:www.youssef-benatti.me
expires : 7 May 2027
```

### How the serving path works

The domain is registered at **Namecheap** (IANA 1068) and the apex A
record points at Namecheap (`159.198.67.228`). Namecheap terminates TLS
with its own certificate and **proxies the request to GitHub Pages**, which
serves the site. The proof that GitHub is answering is the
`x-github-request-id` response header and the correct 404 on unknown paths
(a parking page would not do that).

That is why the domain A record does **not** need to be one of GitHub's
Pages IPs, and why `gh api ... {"https_enforced": true}` still returns
`{"message":"The certificate does not exist yet"}` - GitHub itself has no
certificate for this domain, because Namecheap is terminating TLS in front
of it. The browser still sees a valid, correctly-scoped certificate.

### Known quirk: `www` redirects to `http://`

`https://www.youssef-benatti.me/...` returns a 301 to
`http://youssef-benatti.me/...` (a scheme downgrade) before the apex
redirects back to `https://`. This is GitHub's standard www-to-apex
redirect generated with the scheme it has configured, and the browser
follows it up to HTTPS on the second hop. The page loads over HTTPS, but
one redirect hop is not encrypted.

Cosmetic rather than a security hole. It can be removed by pointing `www`
at the apex with an HTTPS-aware redirect at the registrar, or left as-is
if `www` is not used for anything.

### Verify at any time

```bash
node scripts/check-dns.mjs
```

It checks that the domain resolves (via three resolvers), that the HTTPS
request succeeds, that the response actually came from GitHub Pages, that
the certificate covers the hostname, and that the page still contains the
calculator, the baked affiliate links and the disclosure bar.

---

## Historical note: the DNS change during the first session

At the start of the session the apex resolved to GitHub's Pages IPs
(`185.199.108-111.153`). It then moved to `159.198.67.228`, which briefly
served a Namecheap parking page. That registrar-level change was the
reason GitHub could not issue a certificate. The domain was subsequently
placed behind Namecheap's SSL proxy, which is the configuration live now.

`scripts/setup-dns.mjs` remains available in case the domain ever needs to
be pointed directly at GitHub Pages instead (Option A: by hand, Option B:
via the Namecheap API).

---

## Why the build publishes to a branch instead of `actions/deploy-pages`

GitHub Pages for this repository is in **legacy branch mode** (source:
`gh-pages` branch, path `/`). The `github-pages` environment in this
repository has a deployment branch policy that allows **only** the
`gh-pages` branch. A workflow job that runs from `main` and declares
`environment: github-pages` is therefore rejected at the environment gate
before it starts.

So the workflow pushes the built tree to the `gh-pages` branch directly —
the same publishing model as `scripts/deploy.mjs`, which keeps CI and local
deploys identical. The job deliberately does **not** declare the
`github-pages` environment.

---

## Manual deploy

```bash
node scripts/deploy.mjs
```

This builds, pushes `gh-pages`, mirrors to `/esim/`, and re-asserts the
Pages source configuration. It is idempotent.

---

## Refreshing the catalogue (roadmap Sprint 4.2)

The catalogue is a point-in-time snapshot. To refresh:

1. Re-run the scraper with a throttle (`time.sleep(2.5)` between requests)
   to pick up the destinations that previously returned HTTP 429.
2. Replace the files in `data/`.
3. `node scripts/build.mjs && node scripts/check.mjs && node scripts/validate.mjs`
4. Commit and push — `.github/workflows/refresh-catalogue.yml` publishes it.

The scraper itself is intentionally not automated: it needs the slow path
and manual review of the price tables before they go live.
