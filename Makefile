.DEFAULT_GOAL := help

# ============================================================================
# HELP
# ============================================================================

.PHONY: help
help: ## Show this help message
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ============================================================================
# WORKSPACE VALIDATION
# ============================================================================

.PHONY: install lint format format-check typecheck test build clean package-dry-run
install: ## Install workspace dependencies
	bun install

lint: ## Lint workspace packages
	bun run lint

format: ## Format repository files
	bun run format

format-check: ## Check repository formatting
	bun run format:check

typecheck: ## Type-check workspace packages
	bun run type-check

test: ## Run workspace unit tests
	bun run test

build: ## Build workspace packages
	bun run build

clean: ## Remove generated workspace artifacts
	rm -rf node_modules .turbo packages/*/dist packages/*/tsconfig.tsbuildinfo .timing-cache

package-dry-run: build ## Inspect the publishable package contents
	cd packages/playwright-orchestrator && npm pack --dry-run

# ============================================================================
# EXAMPLES
# ============================================================================

.PHONY: example-install assign-demo
example-install: ## Install basic-example dependencies
	cd examples/basic && npm install && npx playwright install chromium

assign-demo: build ## Demo assignment using the basic example test list
	cd examples/basic && npx playwright test --list --reporter=json > test-list.json
	@echo "=== Test Assignment Demo (3 shards) ==="
	./packages/playwright-orchestrator/bin/run.js assign --test-list ./examples/basic/test-list.json --shards 3 --output-format text --verbose

# ============================================================================
# GITHUB ACTIONS LOCAL TESTING (using act)
# ============================================================================

ACT_PLATFORM = -P ubuntu-24.04=catthehacker/ubuntu:act-24.04
ACT_ARGS = --container-architecture linux/amd64 $(ACT_PLATFORM)
ACT_DOCKER_HOST = $(shell docker context inspect $$(docker context show) --format '{{ .Endpoints.docker.Host }}' 2>/dev/null)

act = DOCKER_HOST="$(ACT_DOCKER_HOST)" act

.PHONY: act-install
act-install: ## Install act (GitHub Actions local runner)
	@echo "Installing act..."
	@if command -v brew > /dev/null 2>&1; then \
		brew install act; \
	elif command -v curl > /dev/null 2>&1; then \
		curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash; \
	else \
		echo "act is required; install it from https://github.com/nektos/act"; \
		exit 1; \
	fi

.PHONY: act-check
act-check: ## Verify that act and its Docker daemon are available
	@command -v act > /dev/null 2>&1 || { echo "act is not installed; run 'make act-install'"; exit 1; }
	@test -n "$(ACT_DOCKER_HOST)" || { echo "Unable to resolve the active Docker context endpoint"; exit 1; }
	@DOCKER_HOST="$(ACT_DOCKER_HOST)" docker info > /dev/null 2>&1 || { echo "Docker is not running or its active context is unavailable"; exit 1; }
	@echo "act is installed: $$(act --version) (Docker: $(ACT_DOCKER_HOST))"

.PHONY: act-test
act-test: act-check ## Run the CI workflow locally
	$(act) pull_request -W .github/workflows/ci.yml $(ACT_ARGS)

.PHONY: act-e2e
act-e2e: act-check ## Run the basic E2E workflow locally
	$(act) workflow_dispatch -W .github/workflows/e2e-example.yml $(ACT_ARGS) --artifact-server-path /tmp/act-artifacts

.PHONY: act-e2e-monorepo
act-e2e-monorepo: act-check ## Run the monorepo E2E workflow locally
	$(act) workflow_dispatch -W .github/workflows/e2e-monorepo.yml $(ACT_ARGS) --artifact-server-path /tmp/act-artifacts

.PHONY: act-publish
act-publish: act-check ## Run Verdaccio publication validation locally
	$(act) pull_request -W .github/workflows/ci.yml -j test-publish $(ACT_ARGS) --artifact-server-path /tmp/act-artifacts
