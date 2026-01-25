---
"@nsxbet/playwright-orchestrator": patch
---

Add CommonJS require exports for Playwright compatibility

Playwright uses CommonJS require() to load custom reporters. The package was ESM-only
with only `import` conditions in exports, causing "Package subpath './reporter' is not
defined by exports" errors when used as a reporter.

Added `require` conditions to both main and reporter exports for compatibility.
