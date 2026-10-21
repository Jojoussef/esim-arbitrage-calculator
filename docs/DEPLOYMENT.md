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
| CI | `.github/workflows/deploy.yml` — build + check + validate + publish on every push to `main` |

The `gh-pages` branch and both URLs are served entirely by GitHub. The
repository `Jojoussef/Jojoussef.github.io` holds the CNAME that binds the
custom domain, so the build is mirrored there at `/esim/` on every deploy.

---

## ⚠️ Open issue: the apex DNS record was changed

**Status:** the site is built, correct and served by GitHub Pages, but the
apex domain `youssef-benatti.me` no longer resolves to GitHub's Pages IPs.

Observed during this session:

```
expected (GitHub Pages) : 185.199.108.153 / .109.153 / .110.153 / .111.153
actual (authoritative)  : 159.198.67.228
authoritative NS        : dns1.registrar-servers.com, dns2.registrar-servers.com
```

`159.198.67.228` is a Namecheap parking address, not GitHub Pages. The
record is a plain A record (no CNAME), and `_github-challenge` has no TXT
entry, which is why GitHub cannot provision a certificate for the custom
domain and `https_enforced` stays `false`.

This did **not** happen because of the deployment — it is a registrar-level
DNS change on the apex domain, and it affects the pre-existing site at
`/` exactly as much as the new `/esim/` paths.

### How to fix it

**The domain is registered at Namecheap** (IANA 1068, `whois.namecheap.com`,
nameservers `dns1/dns2.registrar-servers.com`), so the fix belongs in the
Namecheap DNS panel for `youssef-benatti.me`.

#### Option A — by hand (2 minutes)

1. Delete the parking `A @ 159.198.67.228` record.
2. Add GitHub Pages' records for an apex domain:
   - `A @ 185.199.108.153`
   - `A @ 185.199.109.153`
   - `A @ 185.199.110.153`
   - `A @ 185.199.111.153`
3. For `www`, add `CNAME www @ youssef-benatti.me`.
4. Leave the `CNAME` file at the root of `Jojoussef/Jojoussef.github.io`
   containing `youssef-benatti.me` (it is already there).
5. Verify:

   ```bash
   node scripts/check-dns.mjs
   ```

#### Option B — with the Namecheap API

Enable API access in the Namecheap account (Advanced Settings → API Access),
then:

```bash
export NAMECHEAP_API_USER='your-api-user'
export NAMECHEAP_API_KEY='your-api-key'
export NAMECHEAP_CLIENT_IP='<the account IP whitelist>'

node scripts/setup-dns.mjs     # writes the A + CNAME records
node scripts/check-dns.mjs     # verify
```

`setup-dns.mjs` also supports the Spaceship API if the domain is ever
moved there:

```bash
export SPACESHIP_API_KEY='...'
export SPACESHIP_API_SECRET='...'
node scripts/setup-dns.mjs
```

#### Enabling HTTPS

Once the DNS points at GitHub Pages, GitHub can finally issue a certificate
for the custom domain. Then turn on enforcement:

```bash
gh api --method PUT repos/Jojoussef/Jojoussef.github.io/pages \
  --input - <<'JSON'
{"https_enforced": true}
JSON
```

Until that succeeds, GitHub answers with
`{"message":"The certificate does not exist yet"}` — that is the expected
response while the DNS is still parked.


### Verify at any time

```bash
node scripts/check-dns.mjs
```

It checks the A record against GitHub Pages' ranges via three resolvers and
confirms the live page still has its title, baked affiliate links and
disclosure bar. It exits non-zero if anything is wrong.

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
