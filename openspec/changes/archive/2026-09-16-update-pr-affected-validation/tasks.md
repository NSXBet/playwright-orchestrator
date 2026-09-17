## 1. Affected workspace command

- [ ] 1.1 Add a fail-closed root helper that runs a Turbo task against `...[origin/<base-ref>...HEAD]` after verifying the base ref is available.
- [ ] 1.2 Keep root scripts usable for complete repository validation without an affected filter.

## 2. CI workflow

- [ ] 2.1 Update pull-request CI jobs to fetch the base branch and run affected lint, type-check, test, and build tasks.
- [ ] 2.2 Preserve repository-wide formatting and full unfiltered validation on pushes to `main`.
- [ ] 2.3 Keep Verdaccio publication validation as a complete package check and make its dependency on the build job explicit for both event paths.

## 3. Regression coverage and documentation

- [ ] 3.1 Add tests for filtered and unfiltered command construction, including missing base-ref failure behavior.
- [ ] 3.2 Add a workflow-level regression test for PR affected filters and `main` full-validation commands.
- [ ] 3.3 Document contributor-facing affected-workspace and default-branch validation behavior.

## 4. Verification

- [ ] 4.1 Run format, lint, type-check, unit tests, build, and affected/unaffected range probes.
- [ ] 4.2 Run `actionlint` and the applicable Act CI validation.
- [ ] 4.3 Run `openspec validate update-pr-affected-validation --strict`.
