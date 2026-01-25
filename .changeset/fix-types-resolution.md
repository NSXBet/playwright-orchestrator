---
"@nsxbet/playwright-orchestrator": patch
---

Add typesVersions for TypeScript moduleResolution compatibility

Projects using `moduleResolution: "node"` in their tsconfig.json couldn't resolve
types for subpath imports like `@nsxbet/playwright-orchestrator/fixture`.

Added `typesVersions` field to package.json as a fallback for older TypeScript
configurations that don't support the `exports` field for type resolution.

This fixes the error:
```
Cannot find module '@nsxbet/playwright-orchestrator/fixture' or its corresponding type declarations.
```
