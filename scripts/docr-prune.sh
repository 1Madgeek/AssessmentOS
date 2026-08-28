#!/usr/bin/env bash
# Prune old tags from a container registry (DigitalOcean Container Registry).
#
# Keeps:
#   - Floating tags (DOCR_FLOATING_TAGS, default: latest migrator)
#   - Current VERSION (from Makefile)
#   - Tags currently deployed in k8s (rollback safety)
#   - DOCR_KEEP_TAGS most-recent version tags per repo (default: 2)
#
# Deletes everything else, then runs registry garbage collection.
#
# Requires env from deploy.env / Makefile:
#   DOCTL_CONTEXT, K8S_NAMESPACE, DOCR_REGISTRY_NAME, DOCR_REPOS,
#   DOCR_KEEP_TAGS, VERSION, DOCR_FLOATING_TAGS, DOCR_REGISTRY
#
# Usage:
#   make docr-prune
#   DOCR_PRUNE_DRY_RUN=1 make docr-prune

set -euo pipefail

DOCTL_CONTEXT="${DOCTL_CONTEXT:?DOCTL_CONTEXT is required}"
K8S_NAMESPACE="${K8S_NAMESPACE:?K8S_NAMESPACE is required}"
REGISTRY_NAME="${DOCR_REGISTRY_NAME:?DOCR_REGISTRY_NAME is required}"
DOCR_REGISTRY="${DOCR_REGISTRY:?DOCR_REGISTRY is required}"
KEEP_TAGS="${DOCR_KEEP_TAGS:-2}"
VERSION="${VERSION:-}"
DRY_RUN="${DOCR_PRUNE_DRY_RUN:-0}"
REPOS="${DOCR_REPOS:?DOCR_REPOS is required}"
# Allow comma- or space-separated lists
REPOS="${REPOS//,/ }"
FLOATING_TAGS="${DOCR_FLOATING_TAGS:-latest migrator}"

if ! command -v doctl >/dev/null 2>&1; then
	echo "ERROR: doctl is required" >&2
	exit 1
fi

get_deployed_tags() {
	local repo="$1"
	if ! command -v kubectl >/dev/null 2>&1; then
		return 0
	fi

	kubectl get deploy,sts,cronjob,job -n "$K8S_NAMESPACE" -o json 2>/dev/null \
		| DOCR_REGISTRY="$DOCR_REGISTRY" python3 -c "
import json, os, sys
repo = sys.argv[1]
registry = os.environ.get('DOCR_REGISTRY', '')
needle = f'{registry}/{os.environ.get(\"DOCR_REGISTRY_NAME\", \"\")}/{repo}:'
# Prefer matching on /{repo}: which is registry-agnostic for repo name
needle = f'/{repo}:'
tags = set()
for item in json.load(sys.stdin).get('items', []):
    spec = item.get('spec', {})
    template = spec.get('template') or spec.get('jobTemplate', {}).get('spec', {})
    for container in template.get('spec', {}).get('containers', []):
        image = container.get('image', '')
        if needle in image:
            tags.add(image.rsplit(':', 1)[-1])
print(' '.join(sorted(tags)))
" "$repo" 2>/dev/null || true
}

prune_repo() {
	local repo="$1"
	local tags_json deployed_tags result protected delete_tags delete_count

	if ! tags_json="$(doctl --context "$DOCTL_CONTEXT" registry repository list-tags "$repo" -o json 2>/dev/null)"; then
		echo "  → $repo: not in registry, skipping"
		return 0
	fi

	deployed_tags="$(get_deployed_tags "$repo")"
	result="$(KEEP_TAGS="$KEEP_TAGS" VERSION="$VERSION" REPO="$repo" DEPLOYED_TAGS="$deployed_tags" FLOATING_TAGS="$FLOATING_TAGS" python3 -c "
import json, os, sys

repo = os.environ['REPO']
keep_n = int(os.environ.get('KEEP_TAGS', '2'))
version = os.environ.get('VERSION', '').strip()
deployed = [t for t in os.environ.get('DEPLOYED_TAGS', '').split() if t]
floating = {t for t in os.environ.get('FLOATING_TAGS', 'latest').split() if t}
raw = json.loads(sys.stdin.read())

tag_rows = [row for row in raw if row.get('tag')]
tag_rows.sort(key=lambda row: row['updated_at'], reverse=True)

version_tags = [row['tag'] for row in tag_rows if row['tag'] not in floating]
keep_recent = set(version_tags[:keep_n])

protected = set(floating)
protected.update(keep_recent)
protected.update(deployed)
if version:
    protected.add(version)

all_tags = [row['tag'] for row in tag_rows]
delete_tags = [tag for tag in all_tags if tag not in protected]

print('PROTECTED:' + ','.join(sorted(protected)))
print('DELETE:' + ','.join(delete_tags))
" <<<"$tags_json")"

	protected="$(echo "$result" | awk -F: '/^PROTECTED:/ {print $2}')"
	delete_tags="$(echo "$result" | awk -F: '/^DELETE:/ {print $2}')"

	delete_count=0
	if [ -n "$delete_tags" ]; then
		delete_count="$(echo "$delete_tags" | tr ',' '\n' | sed '/^$/d' | wc -l | tr -d ' ')"
	fi

	echo "  → $repo: keep ${protected:-<none>}, delete $delete_count tag(s)"

	if [ "$delete_count" -eq 0 ]; then
		return 0
	fi

	if [ "$DRY_RUN" = "1" ]; then
		echo "$delete_tags" | tr ',' '\n' | sed '/^$/d' | sed 's/^/      would delete: /'
		return 0
	fi

	local batch=() tag
	while IFS= read -r tag; do
		[ -z "$tag" ] && continue
		batch+=("$tag")
		if [ "${#batch[@]}" -ge 20 ]; then
			doctl --context "$DOCTL_CONTEXT" registry repository delete-tag "$repo" "${batch[@]}" --force
			batch=()
		fi
	done < <(echo "$delete_tags" | tr ',' '\n' | sed '/^$/d')

	if [ "${#batch[@]}" -gt 0 ]; then
		doctl --context "$DOCTL_CONTEXT" registry repository delete-tag "$repo" "${batch[@]}" --force
	fi
}

echo "Pruning registry '$REGISTRY_NAME' (keep $KEEP_TAGS recent version tag(s) per repo)..."
if [ "$DRY_RUN" = "1" ]; then
	echo "DRY RUN — no tags will be deleted, GC will not run."
fi

for repo in $REPOS; do
	prune_repo "$repo"
done

if [ "$DRY_RUN" = "1" ]; then
	echo "Dry run complete."
	exit 0
fi

echo "Starting registry garbage collection (reclaims blob storage)..."
if doctl --context "$DOCTL_CONTEXT" registry garbage-collection get-active "$REGISTRY_NAME" -o json 2>/dev/null \
	| python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='requested' else 1)" 2>/dev/null; then
	echo "  GC already running — skipping start"
else
	doctl --context "$DOCTL_CONTEXT" registry garbage-collection start "$REGISTRY_NAME" \
		--force --include-untagged-manifests
	echo "  GC started (runs asynchronously)"
fi

echo "Registry prune complete."
