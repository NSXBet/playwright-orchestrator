## 1. Workspace and tooling

- [x] 1.1 Create the private root Bun workspace manifest and Turbo task graph using NSW-style conventions.
- [x] 1.2 Add or update pinned mise/Bun, lockfile, lint/format, Git hooks, ignore, and shared repository configuration.
- [x] 1.3 Preserve root developer commands and update Make targets for Turbo/workspace execution.

## 2. Package migration

- [x] 2.1 Move the publishable CLI assets to `packages/playwright-orchestrator/`.
- [x] 2.2 Update package metadata, exports, binary entrypoint, TypeScript/build/test configuration, and package-scoped documentation.
- [x] 2.3 Configure Changesets to version and publish the child package to public npm only.

## 3. Automation and documentation

- [x] 3.1 Update root composite actions while preserving every `.github/actions/*` public path.
- [x] 3.2 Update CI, release, E2E, Act, and Verdaccio workflows for workspace paths and package artifacts.
- [x] 3.3 Update README, integration docs, examples, and path-based workflow triggers.

## 4. Verification

- [x] 4.1 Run formatting, linting, type checking, unit tests, and build from the repository root.
- [x] 4.2 Verify package contents with `npm pack --dry-run` and clean-install/execute the tarball.
- [x] 4.3 Run applicable Act and Verdaccio publication checks.
