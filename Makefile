.PHONY: install lint lint-fix format typecheck test build clean act-test act-publish act-e2e act-e2e-monorepo example-install assign-demo help

# Default target
help:
	@echo "Available targets:"
	@echo ""
	@echo "Development:"
	@echo "  install      - Install dependencies"
	@echo "  lint         - Run Biome linter"
	@echo "  lint-fix     - Run Biome linter with auto-fix"
	@echo "  format       - Format code with Biome"
	@echo "  typecheck    - Run TypeScript type checking"
	@echo "  test         - Run unit tests"
	@echo "  build        - Build the project"
	@echo "  clean        - Remove build artifacts"
	@echo ""
	@echo "Local Testing (via Act):"
	@echo "  act-test     - Run CI workflow locally (lint, test, build)"
	@echo "  act-publish  - Run publish test locally (Verdaccio)"
	@echo "  act-e2e      - Run E2E example workflow locally"
	@echo "  act-e2e-monorepo - Run E2E monorepo workflow locally"
	@echo ""
	@echo "Examples:"
	@echo "  example-install - Install example project dependencies"
	@echo "  assign-demo  - Demo assign command with example tests"

install:
	bun install

lint:
	bun run lint

lint-fix:
	bun run lint:fix

format:
	bun run format

typecheck:
	bun run typecheck

test:
	bun test

build:
	bun run build

clean:
	rm -rf dist
	rm -rf node_modules
	rm -rf .timing-cache

# Install example project dependencies
example-install:
	cd examples/basic && npm install && npx playwright install chromium

# Demo assign command with example tests
assign-demo: build
	@echo "=== Test Assignment Demo (3 shards) ==="
	./bin/run.js assign --test-dir ./examples/basic/tests --shards 3 --level test --glob-pattern "**/*.spec.ts" --output-format text --verbose

# Run GitHub Actions locally with Act
# Requires: https://github.com/nektos/act
act-test:
	@echo "=== Running CI workflow locally with Act ==="
	act -j lint-and-typecheck --rm
	act -j test --rm
	act -j build --rm
	@echo "=== All CI jobs passed ==="

# Run E2E example workflow locally with Act
# Note: This runs the full E2E workflow with sharding
act-e2e:
	@echo "=== Running E2E example workflow locally with Act ==="
	act workflow_dispatch -W .github/workflows/e2e-example.yml --rm
	@echo "=== E2E workflow complete ==="

# Run E2E monorepo workflow locally with Act
# Tests the monorepo path mismatch scenario
act-e2e-monorepo:
	@echo "=== Running E2E monorepo workflow with Act ==="
	act workflow_dispatch -W .github/workflows/e2e-monorepo.yml --rm
	@echo "=== E2E monorepo workflow complete ==="

# Run publish test locally with Act
# Tests that the package can be published and installed correctly
act-publish:
	@echo "=== Running publish test with Act ==="
	act -j test-publish --rm
	@echo "=== Publish test complete ==="
