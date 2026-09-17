#!/usr/bin/env bash
# E2E assertion battery for jest-orchestrator CI.
#
# Consumes the artifacts produced by the e2e-example.yml workflow and
# asserts, with jq, that every guarantee held. Any violation exits 1
# (fails the job loudly). Evidence lines are printed for the log.
#
# Expected layout (working dir = repo root):
#   .orchestration/assignment.json   - orchestrator assignment
#   .orchestration/manifest.json     - discovery manifest
#   timing-artifacts/shard-timing-*.json - per-shard timing artifacts
#   timing-data.json                 - merged store (optional; produced here)
#   LEVEL                            - 'test' | 'file' (default test)
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:-$PWD}"
LEVEL="${LEVEL:-test}"
ASSIGNMENT="$ROOT/.orchestration/assignment.json"
MANIFEST="$ROOT/.orchestration/manifest.json"
ARTDIR="$ROOT/timing-artifacts"

fail() { echo "::error::E2E ASSERTION FAILED: $*"; exit 1; }
pass() { echo "E2E-PASS: $1"; }

[ -f "$ASSIGNMENT" ] || { [ -f "$ROOT/orchestration/assignment.json" ] && ASSIGNMENT="$ROOT/orchestration/assignment.json"; }
[ -f "$ASSIGNMENT" ] || fail "assignment file missing: $ASSIGNMENT"
[ -f "$MANIFEST" ] || fail "manifest file missing: $MANIFEST"

# 1. Assignment shape
jq -e '.shards | length > 0' "$ASSIGNMENT" >/dev/null || fail "assignment has no shards"
LEVEL_IN_ASSIGN=$(jq -r '.level' "$ASSIGNMENT")
[ "$LEVEL_IN_ASSIGN" = "$LEVEL" ] || fail "level mismatch: assignment=$LEVEL_IN_ASSIGN expected=$LEVEL"
pass "assignment reports level=$LEVEL_IN_ASSIGN"

# 2. Every discovered test assigned exactly once (unit-level: testIds
#    expanded per occurrence).
DISCOVERED=$(jq '.tests | length' "$MANIFEST")
ASSIGNED=$(jq '[.shards[].testIds[]] | length' "$ASSIGNMENT")
[ "$ASSIGNED" = "$DISCOVERED" ] || fail "assigned ($ASSIGNED) != discovered ($DISCOVERED)"
pass "all $DISCOVERED discovered tests assigned across shards"

# 3. Every discovered file assigned (file-level: files must not be split)
if [ "$LEVEL" = "file" ]; then
  FILES_IN_MANIFEST=$(jq -r '[.tests[].file] | unique | length' "$MANIFEST")
  FILES_IN_ASSIGNMENT=$(jq -r '[.shards[].files[]] | unique | length' "$ASSIGNMENT")
  [ "$FILES_IN_MANIFEST" = "$FILES_IN_ASSIGNMENT" ] || fail "files placed ($FILES_IN_ASSIGNMENT) != discovered files ($FILES_IN_MANIFEST)"
  pass "every discovered file placed exactly once (file-level)"
fi

# 4. Timing artifacts exist and their measurement count matches the sum
#    of assigned testIds (per shard).
[ -d "$ROOT/timing-artifacts" ] || { echo "::error::no timing-artifacts dir"; exit 1; }
ARTS=("$ROOT"/timing-artifacts/shard-timing-*.json)
MEASURED_SHARDS=0
for ART in "${ARTS[@]}"; do
  [ -f "$ART" ] || continue
  MEASURED_SHARDS=$((MEASURED_SHARDS + 1))
  SHARD_N=$(jq -r '.shard' "$ART")
  MEASURED_N=$(jq '.measurements | length' "$ART")
  EXPECTED_N=$(jq -r --argjson s "$SHARD_N" '.shards[] | select(.shard == $s) | .testIds | length' "$ASSIGNMENT")
  [ "$MEASURED_N" = "$EXPECTED_N" ] || fail "shard $SHARD_N measured $MEASURED_N but $EXPECTED_N assigned"
  pass "shard $SHARD_N: $EXPECTED_N assigned / $MEASURED_N measured"
done
ASSIGNED_SHARDS=$(jq '.shards | length' "$ASSIGNMENT")
[ "$MEASURED_SHARDS" = "$ASSIGNED_SHARDS" ] || fail "measured shards ($MEASURED_SHARDS) != assigned shards ($ASSIGNED_SHARDS)"
pass "bidirectional coverage: all $DISCOVERED tests executed exactly once across $MEASURED_SHARDS shards"

# 5. Merged timing store exists with the same entry count
STORE="$ROOT/timing-data.json"
if [ ! -f "$STORE" ]; then
  # merge now from the artifacts to produce the store
  mkdir -p "$ROOT"
  jest-orchestrator merge-timing --new "$ROOT"/timing-artifacts/shard-timing-*.json --output "$STORE"
fi
ENTRIES=$(jq '[.projects[].files[]] | length' "$STORE")
[ "$ENTRIES" = "$DISCOVERED" ] || fail "store entries ($ENTRIES) != discovered ($DISCOVERED)"
pass "timing store persisted with $ENTRIES entries"

echo "ALL E2E ASSERTIONS PASSED (level=$LEVEL, discovered=$DISCOVERED, assigned=$ASSIGNED, store=$ENTRIES)"
