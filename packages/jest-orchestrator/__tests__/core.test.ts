import { describe, expect, test } from "bun:test";
import {
  assignShards,
  createColdStartTests,
  DEFAULT_TEST_DURATION,
  verifyShardRun,
} from "../src/core/assign.js";
import { selectedTestsForShard, summarizeJestReport } from "../src/commands/annotate.js";
import { assignWithCKK } from "../src/core/ckk-algorithm.js";
import { assignWithLPT } from "../src/core/lpt-algorithm.js";
import { mergeTimingData, pruneTimingData } from "../src/core/timing-store.js";
import type {
  AssignResult,
  JestJsonReport,
  ShardTimingArtifact,
  TestWithDuration,
} from "../src/core/types.js";
import { identityFromKey, identityKey } from "../src/core/types.js";

describe("identity", () => {
  test("key round-trips through weird names", () => {
    const id = {
      project: "p",
      file: "src/a.spec.ts",
      fullName: 'with :: colons, "quotes", unicode ✔, \n newline',
    };
    expect(identityFromKey(identityKey(id))).toEqual(id);
  });
});

describe("file-level assignment", () => {
  const tests: TestWithDuration[] = [
    { project: "p", file: "a.ts", fullName: "a1", duration: 1000 },
    { project: "p", file: "a.ts", fullName: "a2", duration: 1000 },
    { project: "p", file: "b.ts", fullName: "b1", duration: 8000 },
    { project: "p", file: "c.ts", fullName: "c1", duration: 1000 },
  ];

  test("whole files stay in one shard", () => {
    const result = assignShards({
      tests,
      timings: null,
      shards: 2,
      level: "file",
    });
    expect(result.level).toBe("file");
    // no file split across shards
    const fileToShards = new Map<string, Set<number>>();
    for (const s of result.shards) {
      for (const f of s.files) {
        const set = fileToShards.get(f) ?? new Set<number>();
        set.add(s.shard);
        fileToShards.set(f, set);
      }
    }
    for (const shardsSet of fileToShards.values()) {
      expect(shardsSet.size).toBe(1);
    }
  });

  test("every test appears exactly once across shards", () => {
    const result = assignShards({
      tests,
      timings: null,
      shards: 2,
      level: "file",
    });
    const all = result.shards.flatMap((s) => s.testIds);
    expect(all).toHaveLength(4);
    expect(new Set(all).size).toBe(4);
  });

  test("duration per file is the sum of its tests", () => {
    const result = assignShards({
      tests,
      timings: null,
      shards: 2,
      level: "file",
    });
    // b.ts alone is 8000; it dominates one shard's load
    const heavy = result.shards.find((s) => s.files.includes("b.ts"));
    expect(heavy?.expectedDuration).toBe(8000);
  });

  test("defaults to file-level assignment", () => {
    const result = assignShards({ tests, timings: null, shards: 2 });
    expect(result.level).toBe("file");
    const assignedFiles = result.shards.flatMap((shard) => shard.files);
    expect(new Set(assignedFiles).size).toBe(assignedFiles.length);
  });

  test("test-level assignment is available on request", () => {
    const result = assignShards({
      tests,
      timings: null,
      shards: 2,
      level: "test",
    });
    expect(result.level).toBe("test");
  });
});

describe("verifyShardRun", () => {
  test("missing executed test fails loudly", () => {
    const problems = verifyShardRun({
      expected: [
        { file: "a.ts", fullName: "a" },
        { file: "a.ts", fullName: "b" },
      ],
      executed: [{ file: "a.ts", fullName: "a" }],
      shard: 2,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("NOT executed");
    expect(problems[0]).toContain("shard 2");
  });

  test("unexpected executed test fails loudly", () => {
    const problems = verifyShardRun({
      expected: [{ file: "a.ts", fullName: "a" }],
      executed: [
        { file: "a.ts", fullName: "a" },
        { file: "a.ts", fullName: "surprise" },
      ],
      shard: 1,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("WAS executed");
  });

  test("exact match passes", () => {
    const problems = verifyShardRun({
      expected: [
        { file: "a.ts", fullName: "a" },
        { file: "a.ts", fullName: "b" },
      ],
      executed: [
        { file: "a.ts", fullName: "b" },
        { file: "a.ts", fullName: "a" },
      ],
      shard: 1,
    });
    expect(problems).toHaveLength(0);
  });

  test("same fullName in two files: each file verified independently", () => {
    // Both files own a test named 'dup'; only b.ts executed its copy.
    const problems = verifyShardRun({
      expected: [
        { file: "a.ts", fullName: "dup" },
        { file: "b.ts", fullName: "dup" },
      ],
      executed: [{ file: "b.ts", fullName: "dup" }],
      shard: 1,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("a.ts");
  });

  test("duplicate fullNames in one file must execute the same number of times", () => {
    const duplicate = { file: "a.ts", fullName: "dup" };
    const problems = verifyShardRun({
      expected: [duplicate, duplicate],
      executed: [duplicate],
      shard: 1,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("NOT executed");
  });
});

describe("assignShards", () => {
  const tests: TestWithDuration[] = [
    { project: "p", file: "a.ts", fullName: "one", duration: 1000 },
    { project: "p", file: "b.ts", fullName: "two", duration: 5000 },
    { project: "p", file: "c.ts", fullName: "three", duration: 3000 },
  ];

  test("every test assigned exactly once", () => {
    const result = assignShards({ tests, timings: null, shards: 2 });
    const flat = result.shards.flatMap((s) => s.testIds);
    expect(flat).toHaveLength(3);
    expect(new Set(flat).size).toBe(3);
    expect(result.unassigned).toHaveLength(0);
  });

  test("input durations are respected when no timings exist", () => {
    // timings: null means "trust input durations" (they may come from a
    // caller that already applied the store); default-filling only
    // happens against a provided, empty store.
    const result = assignShards({ tests, timings: null, shards: 2 });
    const total = result.shards.reduce((s, x) => s + x.expectedDuration, 0);
    expect(total).toBe(9000);
  });

  test("cold-start inputs use the default estimate without changing source data", () => {
    const coldStart = createColdStartTests(tests);
    expect(coldStart.map((test) => test.duration)).toEqual([
      DEFAULT_TEST_DURATION,
      DEFAULT_TEST_DURATION,
      DEFAULT_TEST_DURATION,
    ]);
    expect(tests.map((test) => test.duration)).toEqual([1000, 5000, 3000]);

    const result = assignShards({ tests: coldStart, timings: null, shards: 2 });
    const total = result.shards.reduce((sum, shard) => sum + shard.expectedDuration, 0);
    expect(total).toBe(tests.length * DEFAULT_TEST_DURATION);
    expect(result.shards.every((shard) => shard.expectedDuration > 0)).toBe(true);
  });

  test("file-level assignment falls back to 10 seconds for an empty timing store", () => {
    const result = assignShards({
      tests: [{ project: "p", file: "new.ts", fullName: "new", duration: 0 }],
      timings: mergeTimingData(null, []),
      shards: 1,
      level: "file",
    });
    expect(result.shards[0]?.expectedDuration).toBe(DEFAULT_TEST_DURATION);
  });

  test("file-level assignment keeps same-file estimates within the Jest project", () => {
    const timings = mergeTimingData(null, [
      {
        project: "p1",
        shard: 1,
        measurements: [{ file: "shared.ts", fullName: "known", duration: 1000 }],
      },
      {
        project: "p2",
        shard: 1,
        measurements: [{ file: "shared.ts", fullName: "known", duration: 9000 }],
      },
    ]);
    const result = assignShards({
      tests: [{ project: "p1", file: "shared.ts", fullName: "new", duration: 0 }],
      timings,
      shards: 1,
      level: "file",
    });
    expect(result.shards[0]?.expectedDuration).toBe(1000);
  });

  test("file-level assignment estimates new tests from their file before global history", () => {
    const timings = mergeTimingData(null, [
      {
        project: "p",
        shard: 1,
        measurements: [
          { file: "known.ts", fullName: "fast", duration: 1000 },
          { file: "known.ts", fullName: "slow", duration: 3000 },
          { file: "other.ts", fullName: "very slow", duration: 9000 },
        ],
      },
    ]);
    const result = assignShards({
      tests: [
        { project: "p", file: "known.ts", fullName: "fast", duration: 0 },
        { project: "p", file: "known.ts", fullName: "new", duration: 0 },
        { project: "p", file: "unseen.ts", fullName: "new", duration: 0 },
      ],
      timings,
      shards: 1,
      level: "file",
    });

    // Exact 1s + same-file average 2s + global average 13s / 3 = 4⅓s.
    expect(result.shards[0]?.expectedDuration).toBe(7333);
  });

  test("duplicate fullNames in same file collapse into one unit but restore count", () => {
    const dup = [...tests, { project: "p", file: "a.ts", fullName: "one", duration: 0 }];
    const result = assignShards({ tests: dup, timings: null, shards: 2 });
    const flat = result.shards.flatMap((s) => s.testIds);
    expect(flat).toHaveLength(4);
  });
});

describe("Jest report annotations", () => {
  test("separates selected skips from tests filtered out of a test-level shard", () => {
    const file = "/repo/example.spec.ts";
    const assignment: AssignResult = {
      shards: [
        {
          shard: 1,
          files: [file],
          selection: [
            { file, fullName: "selected skip" },
            { file, fullName: "selected todo" },
            { file, fullName: "selected pass" },
          ],
          testIds: [],
          expectedDuration: 0,
        },
      ],
      unassigned: [],
      totalTests: 4,
      estimatedSavings: null,
      level: "test",
    };
    const report: JestJsonReport = {
      numTotalTests: 4,
      numPassedTests: 1,
      numFailedTests: 0,
      numPendingTests: 2,
      numTodoTests: 1,
      success: true,
      testResults: [
        {
          name: file,
          status: "focused",
          startTime: 0,
          endTime: 0,
          assertionResults: [
            {
              ancestorTitles: [],
              fullName: "selected skip",
              title: "selected skip",
              status: "pending",
            },
            {
              ancestorTitles: [],
              fullName: "selected todo",
              title: "selected todo",
              status: "todo",
            },
            {
              ancestorTitles: [],
              fullName: "selected pass",
              title: "selected pass",
              status: "passed",
            },
            {
              ancestorTitles: [],
              fullName: "other shard",
              title: "other shard",
              status: "pending",
            },
          ],
        },
      ],
    };

    expect(summarizeJestReport(report, selectedTestsForShard(assignment, 1))).toEqual({
      passed: 1,
      failed: 0,
      skipped: 2,
      notSelected: 1,
    });
  });
});

describe("LPT", () => {
  test("sorts and balances deterministically", () => {
    const shards = assignWithLPT(
      [
        { project: "p", file: "a.ts", fullName: "a", duration: 10 },
        { project: "p", file: "b.ts", fullName: "b", duration: 10 },
        { project: "p", file: "c.ts", fullName: "c", duration: 10 },
        { project: "p", file: "d.ts", fullName: "d", duration: 10 },
      ],
      2,
    );
    expect(shards.map((s) => s.expectedDuration).sort()).toEqual([20, 20]);
  });
});

describe("CKK", () => {
  test("matches LPT on trivial input and balances loads", () => {
    const tests: TestWithDuration[] = Array.from({ length: 20 }, (_, i) => ({
      project: "p",
      file: `f${i}.ts`,
      fullName: `t${i}`,
      duration: (i % 7) * 1000 + 100,
    }));
    const result = assignWithCKK(tests, 4, 50);
    const loads = result.assignments.map((a) => a.expectedDuration);
    const total = tests.reduce((s, t) => s + t.duration, 0);
    expect(Math.max(...loads)).toBeLessThan((total / 4) * 1.5);
  });
});

describe("timing store", () => {
  test("merge applies EMA to existing entries", () => {
    const artifacts: ShardTimingArtifact[] = [
      {
        project: "p",
        shard: 1,
        measurements: [{ file: "a.ts", fullName: "x", duration: 2000 }],
      },
    ];
    const merged = mergeTimingData(null, artifacts);
    const key = Object.keys(merged.projects.p.files)[0];
    expect(merged.projects.p.files[key].duration).toBe(2000);
    expect(merged.projects.p.files[key].runs).toBe(1);

    const merged2 = mergeTimingData(merged, [
      {
        project: "p",
        shard: 1,
        measurements: [{ file: "a.ts", fullName: "x", duration: 1000 }],
      },
    ]);
    const key2 = Object.keys(merged2.projects.p.files)[0];
    // EMA alpha 0.3: 0.3*1000 + 0.7*2000 = 1700
    expect(merged2.projects.p.files[key2].duration).toBe(1700);
    expect(merged2.projects.p.files[key2].runs).toBe(2);
  });

  test("prune drops entries missing from current discovery", () => {
    const artifacts: ShardTimingArtifact[] = [
      {
        project: "p",
        shard: 1,
        measurements: [
          { file: "a.ts", fullName: "kept", duration: 10 },
          { file: "gone.ts", fullName: "dropped", duration: 10 },
        ],
      },
    ];
    const merged = mergeTimingData(null, artifacts);
    const keyOf = (file: string, fullName: string) => identityKey({ project: "p", file, fullName });
    const pruned = pruneTimingData(merged, new Set([keyOf("a.ts", "kept")]), 30);
    const keys = Object.keys(pruned.projects.p?.files ?? {});
    expect(keys).toEqual([keyOf("a.ts", "kept")]);
  });
});
