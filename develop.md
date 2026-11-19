# Developer Notes

> Key conventions and gotchas collected while building and shipping the
> n8n-nodes-17track package. Read this before touching CI or the release flow.

## 1. Environment

| Tool | Version | Notes |
|---|---|---|
| Node.js | **20 or 22** | CI uses 22 (pnpm 11 requires ≥22.13); Node 24 is rejected by the n8n runtime |
| pnpm | 11.x | Locked via the `packageManager` field; pnpm 11 uses `node:sqlite`, so it cannot run on Node 20 locally — run pnpm commands under Node 22 |
| npm | verification only | Not used as the package manager |

**Gotcha**: after `nvm use`, refresh the current shell with `hash -r`. The CI Node
version is controlled by `actions/setup-node` in release.yml and is independent of
your local version.

## 2. Build

```bash
pnpm install
pnpm run build        # tsc -p tsconfig.json + node scripts/copy-assets.js
```

- **Do not build with @n8n/node-cli**: its dependency tree pulls
  `@n8n/expression-runtime → isolated-vm` (native build), which broke three Release
  runs in a row. Plain `tsc` is enough.
- **SVG icons must be copied manually**: `tsc` does not copy non-TS assets.
  `scripts/copy-assets.js` copies `nodes/SeventeenTrack/seventeenTrack.svg`,
  `seventeenTrack.dark.svg` and `credentials/seventeenTrackApi.svg` into `dist/`.
  Forgetting this step = broken icon in the node panel.
- The credential `icon` field only accepts a string literal (`'file:xxx.svg' as const`);
  only the **node** icon supports the `{light, dark}` object form.

## 3. Credentials and authentication (biggest gotcha)

- **Programmatic nodes MUST call `await this.getCredentials('seventeenTrackApi')`** —
  otherwise n8n does not inject the credential's `authenticate` (generic/headers) into
  `helpers.httpRequest` requests, and every request returns 401. This was the biggest
  gotcha in the project's history (the mock harness masked it by injecting headers manually).
- Auth uses an **explicit header**: `execute()` reads `credentials.apiKey` and sets the
  `17token` header directly, instead of relying on n8n's generic-auth auto-injection (belt and braces).
- The credential `test` block performs a live connectivity check against `/getquota` on save.

## 4. Sandbox vs production

- The code contains **a single default**: production `https://api.17track.net/track/v2.4`
  (see `API_BASE` in `nodes/SeventeenTrack/SeventeenTrack.node.ts`).
- Sandbox testing injects via env vars, **never commit them**:
  ```bash
  SEVENTEEN_TRACK_API_BASE="https://test-api-1.17track.net/track/v2.4"
  SEVENTEEN_TRACK_API_KEY="<sandbox key>"
  ```
- API keys always travel via env vars/credentials. **Never commit a key** (README,
  screenshots and logs included).

## 5. 17TRACK business rules (error code cheat sheet)

| Code | Meaning | Handling |
|---|---|---|
| `-18019901` | Number already registered | Expected, skip |
| `-18019902` | Number not registered | **Call register_trackings first** |
| `-18019905` | retrack allowed only once per number | Business rule, expected |
| `-18019909` | No tracking information yet | Just registered, retry later |
| `-18019804` | Old and new carrier are the same | Business rule, expected |
| `-18010204` | Account has no webhook configured | Configure before push |
| `-18019912` | Realtime query interface not authorized | Enable in the 17TRACK backend (paid capability) |
| `-18010001/02/04/05` | Authentication failed | Check the 17token |
| `-18019907/08` | Rate limited | Back off and retry |
| `-18010003/-18019815~17` | Upstream error | Retry later |

Behavior: details only queries **registered** numbers; retrack is one-shot;
change-carrier allows 5 changes per number; batch limit is 40.

## 6. CI / release (semantic-release)

- **Fully automated release**: `push main` → analyze commits → version → CHANGELOG →
  npm publish (provenance-signed) → tag → GitHub Release.
- **Commit messages MUST follow Conventional Commits** (`feat:` / `fix:` / `docs:` /
  `chore:`) — `feat`/`fix` trigger a release, `docs`/`chore` do not.
- `pnpm-lock.yaml` **must be committed** (CI runs `pnpm install --frozen-lockfile`).
  **Never add it to .gitignore** (gotcha: an ignored lock meant CI could not install
  semantic-release).
- CI install uses `pnpm install --frozen-lockfile`; **do not add --ignore-scripts**
  (the dependency tree no longer contains native modules — that was a node-cli-era hack).
- Git push authentication: semantic-release uses the built-in `GITHUB_TOKEN`
  (release.yml declares `contents: write`).
  **Repo Settings → Actions → General → Workflow permissions MUST be "Read and write"** —
  set to read, the built-in token push fails with Invalid username or token, and no
  workflow-file change can fix it.
- NPM_TOKEN must be an **Automation type** token (bypasses npm 2FA; Publish tokens
  hit EOTP under 2FA auth-and-writes mode).
- Scoped publish: `publishConfig.access: public` is configured — do not remove.

## 7. Versioning and tags

- Release tags are created automatically by semantic-release. **Never create release
  tags manually** (a pre-existing tag makes the release fail with tag already exists,
  and a fake tag makes semantic-release believe a version was already published —
  both happened in this repo's history).
- To remove a bogus tag: `git push origin :refs/tags/<tag>`, then re-run the Release
  workflow.

## 8. Testing

- Mock harness: instantiate the node class, mock `IExecuteFunctions`, hit the live
  sandbox (see the `.tools/n8n-e2e/` approach in the main project repo).
- Full e2e: walk all 11 official endpoints and **restore the test account state
  afterwards** (delete what was registered).
- Sandbox test numbers: `4PX3003131010785CN` `4PX3003130266473CN` `UL447201805YP`
  `VR958617555YP`.
- Evidence log: `docs/e2e-evidence.md` (in the main project repo).

## 9. Official docs

- 17TRACK Tracking API v2.4 (11 endpoints): https://asset.17track.net/api/document/v2.4_zh/index.html
- API key management: https://api.17track.net/admin/settings
- Dify plugin output_schema spec: https://docs.dify.ai/en/develop-plugin/features-and-specs/plugin-types/tool
- Reference implementation (domain alignment source): https://github.com/oomol-lab/open-connector
