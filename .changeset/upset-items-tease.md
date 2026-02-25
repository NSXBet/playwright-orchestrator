---
"@nsxbet/playwright-orchestrator": minor
---

Add file affinity to test distribution: tests from the same file are preferentially grouped on the same shard to reduce redundant page/context initialization costs. The penalty is auto-calculated from timing data (P25 of per-file average durations) and amortized by remaining same-file tests. CKK branch-and-bound uses file-aware dedup, penalty-aware lower bounds, and LPT file-aware tiebreaking. Can be overridden with `--file-affinity-penalty` or disabled with `--no-file-affinity`.
