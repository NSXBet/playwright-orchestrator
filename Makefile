.PHONY: install lint lint-fix format typecheck test build clean act-test help

# Default target
help:
	@echo "Available targets:"
	@echo "  install    - Install dependencies"
	@echo "  lint       - Run Biome linter"
	@echo "  lint-fix   - Run Biome linter with auto-fix"
	@echo "  format     - Format code with Biome"
	@echo "  typecheck  - Run TypeScript type checking"
	@echo "  test       - Run tests"
	@echo "  build      - Build the project"
	@echo "  clean      - Remove build artifacts"
	@echo "  act-test   - Run E2E tests locally with Act"

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

# Run GitHub Actions locally with Act
# Requires: https://github.com/nektos/act
act-test:
	@echo "=== Running CI workflow locally with Act ==="
	act -j lint-and-typecheck --rm
	act -j test --rm
	act -j build --rm
	@echo "=== All CI jobs passed ==="
