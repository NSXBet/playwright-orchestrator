## Context

See `proposal.md` for motivation. The repository has a single publishable workspace today, but root scripts already dispatch to Turborepo and future workspaces will share the same CI workflow. The CI workflow currently checks out the default shallow history and runs all tasks in every job.

## Goals / Non-Goals

**Goals:**

- Use Turbo's native affected range for pull-request package tasks.
- Keep the full repository validation baseline on `main`.
- Preserve current CI job names, ordering, public package behavior, root GitHub Action paths, and Verdaccio publication coverage.
- Make the base range reliable by ensuring `origin/<base-ref>` is available before calling Turbo.

**Non-Goals:**

- Adding E2E conditional execution: the repository's expensive E2E workflows are independently dispatched and not CI tasks.
- Adding caches, Docker images, applications, or a second package.
- Filtering repository-wide formatting, which must inspect all tracked files.
- Changing the public CLI, release workflow, npm registry, or package versioning.

## Decisions

### Preserve complete main validation

On a push to `main`, jobs continue using unfiltered root scripts. On a pull request, Turbo-backed lint, type-check, test, and build commands receive `--filter="...[origin/${BASE_REF}...HEAD]"`.

**Rationale:** The default branch remains the broad regression baseline while pull requests avoid unrelated workspace work. The ellipsis range includes workspaces changed since the merge base and their dependents.

**Alternative considered:** Filter every event. Rejected because no complete default-branch verification would remain.

### Resolve the PR base explicitly

Jobs that use the affected range check out with full history and fetch `origin/${BASE_REF}` when the event is a pull request. The shell uses strict error handling so a missing or invalid base branch fails the job.

**Rationale:** GitHub's checkout fetch depth and local remote refs are event-dependent. An explicit fetch makes the range deterministic and fail-closed.

**Alternative considered:** Rely on GitHub's default merge ref or a shallow checkout. Rejected because the base reference may be absent and could produce incomplete task selection.

### Keep format and publication coverage unfiltered

Formatting remains a root-level check because it applies to all tracked repository content. `test-publish` remains an unfiltered `main`-only job because it validates the complete built distributable package and should not publish a partial result from a no-workspace PR.

**Rationale:** These checks are repository/package contracts rather than independent workspace tasks.

**Alternative considered:** Skip publication validation for PRs without an affected package. Rejected until the workflow has explicit job-level gating and coverage for that behavior.

## Risks / Trade-offs

- **Base branch fetch fails or is renamed** → Explicit fetch under strict shell options fails the job; the workflow uses GitHub's supplied `base_ref` only for pull requests.
- **Repository-level changes do not select a package** → Formatting still covers repository files and `main` remains fully validated; later changes can add explicit root-task rules if needed.
- **The current repository has one workspace** → The filter has little immediate time benefit but establishes correct behavior before more packages are added.
- **Workflow conditions can drift from task behavior** → Validate the workflow syntax and run representative filtered and unfiltered Turbo probes before merging.

## Migration Plan

1. Add fail-closed affected-workspace commands to CI jobs and choose filtered or complete commands by event.
2. Validate filtered and unfiltered commands locally using `origin/main...HEAD`, then run workflow syntax validation.
3. Roll back by reverting the workflow-only commit; no package migration is involved.
