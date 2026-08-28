# Deploy to Kubernetes

Generic Docker + Makefile + templated manifests for running AssessmentOS on a Kubernetes cluster (nginx ingress, cert-manager, Postgres in-cluster, mock coding runner).

**This repo is public.** Do not commit real hostnames, registry paths, cluster names, or secrets. Keep them in gitignored local files.

## What you get

| Piece | Notes |
|-------|--------|
| Web | Next.js on `${WEB_HOST}` |
| API | Fastify on `${API_HOST}` |
| DB | Postgres 16 StatefulSet + PVC |
| Runner | Mock (`USE_MOCK_RUNNER=true`) — no Judge0 |
| Assets | PVC on the API pod (API replicas fixed at 1) |

Day-to-day flow matches a typical build → push → roll out → prune loop (`make update`).

## One-time setup

1. **Copy private config**

   ```bash
   cp deploy.env.example deploy.env
   cp k8s/02-secret.example.yaml k8s/02-secret.yaml
   ```

   Edit both files locally:

   - `deploy.env` — kubectl/doctl contexts, registry image names, `WEB_HOST` / `API_HOST`, `CLUSTER_ISSUER`, `IMAGE_PULL_SECRET`
   - `k8s/02-secret.yaml` — `SESSION_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL` (point at `postgres-svc`), optional Resend / Turnstile / backup keys
   - Set `metadata.namespace` in the secret to match `K8S_NAMESPACE` in `deploy.env`

2. **DNS** — Create A/CNAME records for your web and API hosts pointing at your ingress load balancer.

3. **TLS** — Ensure your cert-manager ClusterIssuer already covers the DNS zone for those hosts. This repo does not patch shared ClusterIssuers.

4. **Registry pull secret**

   ```bash
   make k8s-registry-secret
   ```

   Set `IMAGE_PULL_SECRET` in `deploy.env` to the secret name created by your registry tool (for DigitalOcean DOCR, `doctl registry kubernetes-manifest` names it after the registry).

5. **First deploy**

   ```bash
   make full-deploy
   ```

   This builds linux/amd64 images, pushes them, applies manifests (via `envsubst` from `deploy.env`), runs the Drizzle migration Job, and rolls out web + API.

## Day-to-day

```bash
make bump-patch    # optional
make update        # build + push + roll out + prune node images + prune old registry tags
make k8s-status
make k8s-logs-api
make k8s-logs-web
make k8s-migrate   # after schema changes
```

## Build-time vs runtime config

- **`NEXT_PUBLIC_API_URL`** is baked into the web image at `docker build` from `https://$(API_HOST)`. Rebuild the web image when the API hostname changes.
- Optional **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** can be set in `deploy.env` as a build-arg.
- Secrets and origins (`WEB_ORIGIN`, `CORS_ORIGIN`, DB URL, etc.) are runtime ConfigMap / Secret values.

## Email (Resend)

Without `RESEND_API_KEY`, the API logs mail to stdout. With Resend’s default test sender, delivery is limited until you verify a domain and set `EMAIL_FROM`.

## Admin accounts (registration locked)

Public `POST /auth/register` is **off** unless `ALLOW_PUBLIC_REGISTER=true`.

Create the first owner:

```bash
make k8s-create-admin EMAIL=you@company.com PASSWORD='your-secure-password' NAME='Your Name'
```

Local DB: `make create-admin EMAIL=... PASSWORD=...`.

Then sign in at `https://$(WEB_HOST)/admin/login`. Invite further recruiters from **Org** settings after login (do not open public register on a private company deploy).

## Backups

`k8s/10-backup-cronjob.yaml` dumps Postgres weekly to S3-compatible storage when `DO_SPACES_*` keys are present in the secret. Trigger manually with `make k8s-backup-now`.

## Local development

K8s deploy files are optional. For local work, keep using [[Local-Setup]] (`docker compose` + `pnpm`).
