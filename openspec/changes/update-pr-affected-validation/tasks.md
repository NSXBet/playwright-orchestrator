## 1. CI workflow

- [x] 1.1 Update pull-request CI jobs to fetch the base branch and run affected lint, type-check, test, and build tasks.
- [x] 1.2 Preserve repository-wide formatting and full unfiltered validation on pushes to `main`.
- [x] 1.3 Keep Verdaccio publication validation as a complete package check only when its package workspace is affected on pull requests.

## 2. Verification

- [x] 2.1 Run `actionlint` against the changed workflow.
- [x] 2.2 Run affected and unfiltered Turbo validation probes locally.
- [x] 2.3 Run `openspec validate update-pr-affected-validation --strict`.
