# AssessmentOS — Docker & Kubernetes deployment
# Usage: make <command>
#
# Site-specific values live in deploy.env (gitignored). Copy from deploy.env.example.

.PHONY: help require-deploy-env build push build-push deploy update version \
	bump-patch bump-minor bump-major docr-prune create-admin mcp-build mcp-publish \
	build-judge0 push-judge0 build-push-judge0 \
	k8s-context k8s-deploy k8s-status k8s-logs k8s-logs-api k8s-logs-web k8s-logs-postgres \
	k8s-logs-judge0 k8s-scale k8s-update k8s-rollback k8s-restart k8s-clean k8s-prune-images \
	k8s-migrate k8s-create-admin k8s-registry-secret k8s-secrets-apply k8s-secrets-view \
	k8s-apply-file k8s-exec-api k8s-exec-web k8s-pg-shell \
	k8s-backup-now k8s-backup-status k8s-backup-logs \
	full-deploy

# ── Load private deploy config ───────────────────────────────────────────────
ifeq ($(wildcard deploy.env),)
  DEPLOY_ENV_MISSING := 1
else
  include deploy.env
  export
endif

# ── Versioning ───────────────────────────────────────────────────────────────
VERSION_FILE  := VERSION
BASE_VERSION  := $(shell cat $(VERSION_FILE) 2>/dev/null || echo "0.0.0")
GIT_DIRTY     := $(shell git diff-index --quiet HEAD -- 2>/dev/null && echo "clean" || echo "dirty")
BUILD_STAMP   := $(shell date -u +%Y%m%d-%H%M%S)
ifeq ($(GIT_DIRTY),dirty)
    VERSION ?= $(BASE_VERSION)-dev.$(BUILD_STAMP)
else
    VERSION ?= $(BASE_VERSION)
endif

K8S_DIR ?= k8s
DOCR_KEEP_TAGS ?= 2
DOCR_FLOATING_TAGS ?= latest migrator

# Variables substituted into k8s templates (keep shell ${VAR} in cronjobs intact)
ENVSUBST_VARS := $${K8S_NAMESPACE} $${WEB_HOST} $${API_HOST} $${WEB_IMAGE} $${API_IMAGE} \
	$${JUDGE0_IMAGE} $${CLUSTER_ISSUER} $${IMAGE_PULL_SECRET} $${VERSION}

define require_deploy_env
	@if [ "$(DEPLOY_ENV_MISSING)" = "1" ]; then \
		echo "ERROR: deploy.env is missing."; \
		echo "       cp deploy.env.example deploy.env  # then fill in your values"; \
		exit 1; \
	fi
	@missing=""; \
	for v in K8S_CONTEXT K8S_NAMESPACE WEB_HOST API_HOST WEB_IMAGE API_IMAGE \
		DOCTL_CONTEXT DOCR_REGISTRY DOCR_REGISTRY_NAME DOCR_REPOS \
		CLUSTER_ISSUER IMAGE_PULL_SECRET; do \
		eval "val=\$$v"; \
		if [ -z "$$val" ]; then missing="$$missing $$v"; fi; \
	done; \
	if [ -n "$$missing" ]; then \
		echo "ERROR: deploy.env is missing required vars:$$missing"; \
		exit 1; \
	fi
endef

define k8s_apply
	@set -e; \
	f="$(1)"; \
	echo "  apply $$f"; \
	envsubst '$(ENVSUBST_VARS)' < "$$f" | kubectl apply -f -
endef

help:
	@echo "AssessmentOS — Docker & Kubernetes"
	@echo ""
	@echo "Setup (once):"
	@echo "  cp deploy.env.example deploy.env   # fill privately — never commit"
	@echo "  cp k8s/02-secret.example.yaml k8s/02-secret.yaml"
	@echo "  make k8s-registry-secret"
	@echo "  make full-deploy"
	@echo ""
	@echo "Day-to-day:"
	@echo "  make update              - Build, push, roll out, prune images"
	@echo "  make k8s-status          - Cluster status"
	@echo "  make k8s-migrate         - Run DB migrations"
	@echo "  make k8s-create-admin EMAIL=... PASSWORD=... [NAME=...]"
	@echo "  make create-admin EMAIL=... PASSWORD=... [NAME=...]  (local DB)"
	@echo "  make mcp-publish         - Build and npm publish assessmentos-mcp"
	@echo "  make build-push-judge0   - Optional Judge0 unit image (not used by default)"
	@echo ""
	@echo "See docs/Deploy-K8s.md for the full checklist."

require-deploy-env:
	$(call require_deploy_env)

# ============================================================================
# Quick workflows
# ============================================================================

deploy: k8s-deploy

update: require-deploy-env build-push k8s-update k8s-prune-images docr-prune
	@echo "Update complete! Watch: make k8s-status"

full-deploy: require-deploy-env build-push k8s-deploy k8s-migrate
	@echo "=== Full deploy ==="
	@kubectl set image deployment/web web=$(WEB_IMAGE):$(VERSION) -n $(K8S_NAMESPACE)
	@kubectl set image deployment/api api=$(API_IMAGE):$(VERSION) -n $(K8S_NAMESPACE)
	@kubectl rollout status deployment/web -n $(K8S_NAMESPACE) --timeout=300s
	@kubectl rollout status deployment/api -n $(K8S_NAMESPACE) --timeout=300s
	@echo "=== Deploy complete ==="

# ============================================================================
# Versioning
# ============================================================================

version:
	@echo "Base version: $(BASE_VERSION)  (from $(VERSION_FILE))"
	@echo "Working tree: $(GIT_DIRTY)"
	@echo "Build version: $(VERSION)"

bump-patch:
	@v=$$(awk -F. '{printf "%d.%d.%d", $$1, $$2, $$3+1}' $(VERSION_FILE)); \
		echo $$v > $(VERSION_FILE); \
		echo "Bumped patch: $(BASE_VERSION) -> $$v"

bump-minor:
	@v=$$(awk -F. '{printf "%d.%d.0", $$1, $$2+1}' $(VERSION_FILE)); \
		echo $$v > $(VERSION_FILE); \
		echo "Bumped minor: $(BASE_VERSION) -> $$v"

bump-major:
	@v=$$(awk -F. '{printf "%d.0.0", $$1+1}' $(VERSION_FILE)); \
		echo $$v > $(VERSION_FILE); \
		echo "Bumped major: $(BASE_VERSION) -> $$v"

# ============================================================================
# MCP npm package (assessmentos-mcp)
# ============================================================================

mcp-build:
	@pnpm --filter @assessment-os/sdk build
	@pnpm --filter @assessment-os/mcp build
	@echo "Built apps/mcp/dist/index.js (bundled for npx)"

# Publish to npm as assessmentos-mcp (not the workspace name). Requires npm login / NPM_TOKEN.
# Bump apps/mcp/package.json version first. Tag mcp-vX.Y.Z for CI.
# Staging dir avoids monorepo workspace:* / name clash when consumers run npx from this repo.
mcp-publish: mcp-build
	@rm -rf apps/mcp/.publish
	@mkdir -p apps/mcp/.publish
	@cp -R apps/mcp/dist apps/mcp/.publish/
	@cp apps/mcp/README.md apps/mcp/.publish/
	@node -e 'const fs=require("fs"); const pkg=require("./apps/mcp/package.json"); const out={name:"assessmentos-mcp",version:pkg.version,description:pkg.description,license:pkg.license,type:"module",bin:pkg.bin,files:["dist","README.md"],engines:pkg.engines,repository:pkg.repository,keywords:pkg.keywords,publishConfig:{access:"public"},dependencies:{}}; fs.writeFileSync("apps/mcp/.publish/package.json", JSON.stringify(out,null,2)+"\n");'
	@cd apps/mcp/.publish && npm publish --access public
	@rm -rf apps/mcp/.publish
	@echo "Published assessmentos-mcp@$$(node -p "require('./apps/mcp/package.json').version")"

# ============================================================================
# Docker images
# ============================================================================

build: require-deploy-env
	@echo "Building web ($(VERSION))..."
	@docker build --platform linux/amd64 \
		--build-arg NEXT_PUBLIC_API_URL=https://$(API_HOST) \
		--build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=$(NEXT_PUBLIC_TURNSTILE_SITE_KEY) \
		-t $(WEB_IMAGE):$(VERSION) \
		-t $(WEB_IMAGE):latest \
		-f docker/Dockerfile.web .
	@echo "Building api ($(VERSION))..."
	@docker build --platform linux/amd64 \
		-t $(API_IMAGE):$(VERSION) \
		-t $(API_IMAGE):latest \
		-f docker/Dockerfile.api .
	@echo "Building migrator..."
	@docker build --platform linux/amd64 --target migrator \
		-t $(API_IMAGE):migrator \
		-f docker/Dockerfile.api .
	@echo "Images built."

push: require-deploy-env
	@echo "Logging into registry..."
	@doctl --context $(DOCTL_CONTEXT) registry login
	@docker push $(WEB_IMAGE):$(VERSION)
	@docker push $(WEB_IMAGE):latest
	@docker push $(API_IMAGE):$(VERSION)
	@docker push $(API_IMAGE):latest
	@docker push $(API_IMAGE):migrator
	@echo "Images pushed."

build-push: build push

# Judge0 unit image — optional (prod uses mock runner tools on the API image).
# Requires JUDGE0_IMAGE in deploy.env when used.
build-judge0: require-deploy-env
	@if [ -z "$(JUDGE0_IMAGE)" ]; then echo "ERROR: set JUDGE0_IMAGE in deploy.env"; exit 1; fi
	@echo "Building Judge0 unit image ($(JUDGE0_IMAGE):latest)..."
	@docker build --platform linux/amd64 \
		-t $(JUDGE0_IMAGE):latest \
		-t $(JUDGE0_IMAGE):1.13.1 \
		-f docker/judge0-unit/Dockerfile .
	@echo "Judge0 unit image built."

push-judge0: require-deploy-env
	@if [ -z "$(JUDGE0_IMAGE)" ]; then echo "ERROR: set JUDGE0_IMAGE in deploy.env"; exit 1; fi
	@echo "Pushing Judge0 unit image..."
	@doctl --context $(DOCTL_CONTEXT) registry login
	@docker push $(JUDGE0_IMAGE):latest
	@docker push $(JUDGE0_IMAGE):1.13.1
	@echo "Judge0 unit image pushed."

build-push-judge0: build-judge0 push-judge0

docr-prune: require-deploy-env
	@VERSION=$(VERSION) DOCTL_CONTEXT=$(DOCTL_CONTEXT) K8S_NAMESPACE=$(K8S_NAMESPACE) \
		DOCR_REGISTRY=$(DOCR_REGISTRY) DOCR_REGISTRY_NAME=$(DOCR_REGISTRY_NAME) \
		DOCR_KEEP_TAGS=$(DOCR_KEEP_TAGS) DOCR_REPOS="$(DOCR_REPOS)" \
		DOCR_FLOATING_TAGS="$(DOCR_FLOATING_TAGS)" \
		DOCR_PRUNE_DRY_RUN=$(DOCR_PRUNE_DRY_RUN) \
		bash scripts/docr-prune.sh

# ============================================================================
# Kubernetes
# ============================================================================

k8s-context: require-deploy-env
	@kubectl config use-context $(K8S_CONTEXT)

k8s-deploy: k8s-context
	@echo "Deploying to namespace $(K8S_NAMESPACE)..."
	@if [ ! -f $(K8S_DIR)/02-secret.yaml ]; then \
		echo "ERROR: $(K8S_DIR)/02-secret.yaml missing."; \
		echo "       cp $(K8S_DIR)/02-secret.example.yaml $(K8S_DIR)/02-secret.yaml"; \
		exit 1; \
	fi
	$(call k8s_apply,$(K8S_DIR)/00-namespace.yaml)
	$(call k8s_apply,$(K8S_DIR)/01-configmap.yaml)
	@kubectl apply -f $(K8S_DIR)/02-secret.yaml
	$(call k8s_apply,$(K8S_DIR)/03-postgres.yaml)
	$(call k8s_apply,$(K8S_DIR)/04-api-deployment.yaml)
	$(call k8s_apply,$(K8S_DIR)/04-web-deployment.yaml)
	$(call k8s_apply,$(K8S_DIR)/05-services.yaml)
	$(call k8s_apply,$(K8S_DIR)/06-ingress.yaml)
	$(call k8s_apply,$(K8S_DIR)/08-hpa.yaml)
	$(call k8s_apply,$(K8S_DIR)/10-backup-cronjob.yaml)
	@echo "Deploy applied. Status: make k8s-status"

k8s-status: k8s-context
	@echo "=== AssessmentOS K8s Status (ns=$(K8S_NAMESPACE)) ==="
	@kubectl get deployments,pods,svc,ingress,statefulsets,pvc,hpa,cronjobs -n $(K8S_NAMESPACE) 2>/dev/null || true

k8s-logs-web:
	@kubectl logs -f deployment/web -n $(K8S_NAMESPACE) --tail=100

k8s-logs-api:
	@kubectl logs -f deployment/api -n $(K8S_NAMESPACE) --tail=100

k8s-logs: k8s-logs-api

k8s-logs-postgres:
	@kubectl logs -f statefulset/postgres -n $(K8S_NAMESPACE) --tail=100

k8s-scale: require-deploy-env
	@if [ -z "$(REPLICAS)" ]; then echo "Usage: make k8s-scale REPLICAS=3"; exit 1; fi
	@kubectl scale deployment web --replicas=$(REPLICAS) -n $(K8S_NAMESPACE)

k8s-update: k8s-context
	@echo "Rolling out $(VERSION)..."
	@if ! docker manifest inspect $(WEB_IMAGE):$(VERSION) >/dev/null 2>&1; then \
		echo "ERROR: $(WEB_IMAGE):$(VERSION) not in registry. Run make build-push first."; \
		exit 1; \
	fi
	@if ! docker manifest inspect $(API_IMAGE):$(VERSION) >/dev/null 2>&1; then \
		echo "ERROR: $(API_IMAGE):$(VERSION) not in registry. Run make build-push first."; \
		exit 1; \
	fi
	$(call k8s_apply,$(K8S_DIR)/01-configmap.yaml)
	@kubectl set image deployment/web web=$(WEB_IMAGE):$(VERSION) -n $(K8S_NAMESPACE)
	@kubectl set image deployment/api api=$(API_IMAGE):$(VERSION) -n $(K8S_NAMESPACE)
	@kubectl rollout restart deployment/api -n $(K8S_NAMESPACE)
	@kubectl rollout status deployment/web -n $(K8S_NAMESPACE) --timeout=300s
	@kubectl rollout status deployment/api -n $(K8S_NAMESPACE) --timeout=300s
	@echo "Rollout complete."

k8s-logs-judge0: k8s-context
	@kubectl logs -f deployment/judge0 -n $(K8S_NAMESPACE) --tail=100

k8s-rollback: require-deploy-env
	@kubectl rollout undo deployment/web -n $(K8S_NAMESPACE)
	@kubectl rollout undo deployment/api -n $(K8S_NAMESPACE)
	@echo "Rollback initiated."

k8s-restart: require-deploy-env
	@kubectl rollout restart deployment/web -n $(K8S_NAMESPACE)
	@kubectl rollout restart deployment/api -n $(K8S_NAMESPACE)

k8s-prune-images: k8s-context
	@echo "Pruning unused container images on all nodes..."
	@for node in $$(kubectl get nodes -o jsonpath='{.items[*].metadata.name}'); do \
		echo "  → $$node"; \
		kubectl debug node/$$node --image=busybox --profile=general --attach=false -q \
			-- chroot /host crictl --timeout=300s rmi --prune >/dev/null 2>&1 || true; \
	done; \
	echo "  waiting..."; \
	sleep 20; \
	for pod in $$(kubectl get pods -n default -o name 2>/dev/null | grep node-debugger); do \
		kubectl logs -n default $$pod 2>/dev/null | sed 's/^/      /'; \
		kubectl delete -n default $$pod >/dev/null 2>&1 || true; \
	done; \
	echo "Image prune complete."

k8s-clean: require-deploy-env
	@echo "WARNING: Deletes ALL resources in namespace $(K8S_NAMESPACE) including Postgres data."
	@read -p "Type '$(K8S_NAMESPACE)' to confirm: " confirm && [ "$$confirm" = "$(K8S_NAMESPACE)" ] || exit 1
	@kubectl delete namespace $(K8S_NAMESPACE)

k8s-migrate: k8s-context
	@echo "Running Drizzle migrations..."
	@kubectl delete job assessmentos-migrate -n $(K8S_NAMESPACE) --ignore-not-found
	$(call k8s_apply,$(K8S_DIR)/09-migration-job.yaml)
	@kubectl wait --for=condition=complete job/assessmentos-migrate -n $(K8S_NAMESPACE) --timeout=180s
	@echo "Migrations complete."

# Create an owner recruiter against the in-cluster DB (via API pod).
# Usage: make k8s-create-admin EMAIL=you@company.com PASSWORD='...' NAME='Your Name'
k8s-create-admin: k8s-context
	@if [ -z "$(EMAIL)" ] || [ -z "$(PASSWORD)" ]; then \
		echo "Usage: make k8s-create-admin EMAIL=you@company.com PASSWORD='...' [NAME='Admin']"; \
		exit 1; \
	fi
	@kubectl exec -n $(K8S_NAMESPACE) deploy/api -- \
		node dist/create-admin.js \
		--email "$(EMAIL)" \
		--password "$(PASSWORD)" \
		--name "$(or $(NAME),Admin)"

# Local DB: make create-admin EMAIL=... PASSWORD=... [NAME=...]
create-admin:
	@if [ -z "$(EMAIL)" ] || [ -z "$(PASSWORD)" ]; then \
		echo "Usage: make create-admin EMAIL=you@company.com PASSWORD='...' [NAME='Admin']"; \
		exit 1; \
	fi
	@pnpm --filter @assessment-os/api create-admin -- \
		--email "$(EMAIL)" \
		--password "$(PASSWORD)" \
		--name "$(or $(NAME),Admin)"

k8s-pg-shell: require-deploy-env
	@POD=$$(kubectl get pods -n $(K8S_NAMESPACE) -l app=postgres -o jsonpath='{.items[0].metadata.name}'); \
	kubectl exec -it $$POD -n $(K8S_NAMESPACE) -- psql -U assessment -d assessmentos

k8s-registry-secret: k8s-context
	@echo "Creating registry pull secret in $(K8S_NAMESPACE)..."
	$(call k8s_apply,$(K8S_DIR)/00-namespace.yaml)
	@doctl --context $(DOCTL_CONTEXT) registry kubernetes-manifest --namespace=$(K8S_NAMESPACE) | kubectl apply -f -
	@echo "Registry secret applied (name may be registry-<registry>; set IMAGE_PULL_SECRET in deploy.env to match)."

k8s-secrets-apply: require-deploy-env
	@kubectl apply -f $(K8S_DIR)/02-secret.yaml
	@echo "Secrets applied. Restart: make k8s-restart"

k8s-secrets-view: require-deploy-env
	@kubectl get secrets -n $(K8S_NAMESPACE)
	@kubectl get secret assessmentos-secret -n $(K8S_NAMESPACE) -o jsonpath='{.data}' 2>/dev/null \
		| python3 -c "import sys,json; [print(f'  {k}') for k in sorted(json.load(sys.stdin).keys())]" 2>/dev/null || true

k8s-exec-api: require-deploy-env
	@POD=$$(kubectl get pods -n $(K8S_NAMESPACE) -l app=assessmentos-api -o jsonpath='{.items[0].metadata.name}'); \
	kubectl exec -it $$POD -n $(K8S_NAMESPACE) -- /bin/sh

k8s-exec-web: require-deploy-env
	@POD=$$(kubectl get pods -n $(K8S_NAMESPACE) -l app=assessmentos-web -o jsonpath='{.items[0].metadata.name}'); \
	kubectl exec -it $$POD -n $(K8S_NAMESPACE) -- /bin/sh

k8s-backup-now: k8s-context
	@kubectl create job pg-backup-manual-$$(date +%Y%m%d-%H%M%S) \
		--from=cronjob/pg-backup -n $(K8S_NAMESPACE)

k8s-backup-status: k8s-context
	@kubectl get cronjob pg-backup -n $(K8S_NAMESPACE) 2>/dev/null || echo "CronJob not found"
	@kubectl get jobs,pods -n $(K8S_NAMESPACE) -l app=pg-backup --sort-by=.metadata.creationTimestamp 2>/dev/null | tail -10

k8s-backup-logs: require-deploy-env
	@POD=$$(kubectl get pods -n $(K8S_NAMESPACE) -l app=pg-backup --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}'); \
	kubectl logs $$POD -n $(K8S_NAMESPACE)
