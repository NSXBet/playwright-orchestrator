import type { TestShardAssignment, TestWithDuration } from './types.js';

/**
 * Default timeout for CKK algorithm in milliseconds
 */
export const DEFAULT_CKK_TIMEOUT = 500;

/**
 * Result from the CKK algorithm
 */
export interface CKKResult {
  /** Shard assignments */
  assignments: TestShardAssignment[];
  /** Maximum shard duration (makespan) */
  makespan: number;
  /** Whether the solution is provably optimal */
  isOptimal: boolean;
}

/**
 * Complete Karmarkar-Karp (CKK) inspired algorithm for multi-way number partitioning
 *
 * This algorithm finds the optimal distribution of tests across shards by:
 * 1. Using branch and bound search with aggressive pruning
 * 2. Starting with LPT solution as upper bound
 * 3. Exploring assignment tree, pruning when partial makespan exceeds best
 *
 * Falls back to LPT if search exceeds timeout.
 *
 * @param tests - Tests with their durations
 * @param numShards - Number of shards to distribute across
 * @param timeoutMs - Maximum time to search for optimal solution
 * @returns Optimal (or near-optimal) shard assignments
 */
export function assignWithCKK(
  tests: TestWithDuration[],
  numShards: number,
  timeoutMs: number = DEFAULT_CKK_TIMEOUT,
  fileAffinityPenalty = 0,
): CKKResult {
  if (tests.length === 0) {
    return {
      assignments: createEmptyAssignments(numShards),
      makespan: 0,
      isOptimal: true,
    };
  }

  if (numShards <= 0) {
    throw new Error('Number of shards must be positive');
  }

  if (numShards >= tests.length) {
    // More shards than tests - each test gets its own shard
    return assignOnePerShard(tests, numShards);
  }

  // Sort tests by duration descending, then by file ascending for better
  // file-affinity convergence (same-file tests appear adjacent)
  const sortedTests = [...tests].sort(
    (a, b) => b.duration - a.duration || a.file.localeCompare(b.file),
  );

  // Precompute per-file test counts for penalty amortization
  const fileTestCounts = new Map<string, number>();
  for (const test of sortedTests) {
    fileTestCounts.set(test.file, (fileTestCounts.get(test.file) ?? 0) + 1);
  }

  // Get LPT solution as upper bound (uses its own copy of fileRemaining)
  const lptResult = assignWithLPTInternal(
    sortedTests,
    numShards,
    fileAffinityPenalty,
    fileTestCounts,
    new Map(fileTestCounts),
  );
  let bestMakespan = lptResult.makespan;
  let bestAssignment = lptResult.assignments;
  let isOptimal = false;

  // Track remaining unassigned tests per file for CKK search
  const fileRemaining = new Map<string, number>(fileTestCounts);

  // For small inputs, try to find optimal solution
  const startTime = Date.now();

  // Branch and bound search
  // effectiveLoads include penalty; actualLoads are real durations for output
  const effectiveLoads = new Array(numShards).fill(0) as number[];
  const actualLoads = new Array(numShards).fill(0) as number[];
  const shardTests: string[][] = Array.from({ length: numShards }, () => []);
  const shardFiles: Set<string>[] = Array.from(
    { length: numShards },
    () => new Set<string>(),
  );

  function computePenalty(shardIdx: number, file: string): number {
    if (fileAffinityPenalty <= 0 || shardFiles[shardIdx]?.has(file)) return 0;
    const total = fileTestCounts.get(file) ?? 1;
    const remaining = fileRemaining.get(file) ?? 1;
    return Math.round(fileAffinityPenalty * (remaining / total));
  }

  function search(testIndex: number): boolean {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      return false; // Timeout, stop search
    }

    // All tests assigned
    if (testIndex >= sortedTests.length) {
      const currentMakespan = Math.max(...effectiveLoads);
      if (currentMakespan < bestMakespan) {
        bestMakespan = currentMakespan;
        bestAssignment = actualLoads.map((load, i) => ({
          shardIndex: i + 1,
          tests: [...(shardTests[i] ?? [])],
          expectedDuration: load,
        }));
        isOptimal = true;
      }
      return true;
    }

    const test = sortedTests[testIndex];
    if (!test) return true;

    // Calculate lower bound: current max + remaining items distributed perfectly
    const remainingTests = sortedTests.slice(testIndex);
    let remainingDuration = 0;
    for (const t of remainingTests) {
      remainingDuration += t.duration;
    }

    // Account for minimum penalties: each unique file among remaining tests
    // that isn't on ANY shard yet will require at least one penalty payment
    let minPenaltyCost = 0;
    if (fileAffinityPenalty > 0) {
      const allShardFiles = new Set<string>();
      for (const files of shardFiles) {
        for (const f of files) allShardFiles.add(f);
      }
      const newFiles = new Set<string>();
      for (const t of remainingTests) {
        if (!allShardFiles.has(t.file)) newFiles.add(t.file);
      }
      // Each new file incurs at least one amortized penalty
      for (const file of newFiles) {
        const total = fileTestCounts.get(file) ?? 1;
        const remaining = fileRemaining.get(file) ?? 1;
        minPenaltyCost += Math.round(fileAffinityPenalty * (remaining / total));
      }
    }

    const currentMax = Math.max(...effectiveLoads);
    const totalAfter =
      effectiveLoads.reduce((sum, l) => sum + l, 0) +
      remainingDuration +
      minPenaltyCost;
    const lowerBound = Math.max(currentMax, Math.ceil(totalAfter / numShards));

    // Prune if lower bound exceeds best
    if (lowerBound >= bestMakespan) {
      return true;
    }

    // Try assigning to each shard, starting with least loaded
    const shardOrder = effectiveLoads
      .map((load, i) => ({ load, index: i }))
      .sort((a, b) => a.load - b.load)
      .map((s) => s.index);

    // Skip duplicate states to avoid redundant exploration.
    // When penalty > 0, key on load + whether shard has the file,
    // since two shards with the same load but different file sets are NOT equivalent.
    const seenStates = new Set<string>();

    for (const shardIdx of shardOrder) {
      const load = effectiveLoads[shardIdx];
      if (load === undefined) continue;

      const hasFile = shardFiles[shardIdx]?.has(test.file) ?? false;
      const dedupKey =
        fileAffinityPenalty > 0 ? `${load}:${hasFile}` : `${load}`;

      if (seenStates.has(dedupKey)) {
        continue;
      }
      seenStates.add(dedupKey);

      const penalty = computePenalty(shardIdx, test.file);
      const effectiveCost = test.duration + penalty;

      // Prune: if adding to this shard exceeds best makespan, skip
      if (load + effectiveCost >= bestMakespan) {
        continue;
      }

      // Assign test to shard
      effectiveLoads[shardIdx] = load + effectiveCost;
      actualLoads[shardIdx] = (actualLoads[shardIdx] ?? 0) + test.duration;
      const isNewFile = !shardFiles[shardIdx]?.has(test.file);
      shardFiles[shardIdx]?.add(test.file);
      shardTests[shardIdx]?.push(test.testId);
      fileRemaining.set(test.file, (fileRemaining.get(test.file) ?? 1) - 1);

      const completed = search(testIndex + 1);
      if (!completed) {
        // Timeout - restore and return
        effectiveLoads[shardIdx] = load;
        actualLoads[shardIdx] = (actualLoads[shardIdx] ?? 0) - test.duration;
        if (isNewFile) shardFiles[shardIdx]?.delete(test.file);
        shardTests[shardIdx]?.pop();
        fileRemaining.set(test.file, (fileRemaining.get(test.file) ?? 0) + 1);
        return false;
      }

      // Restore state for backtracking
      effectiveLoads[shardIdx] = load;
      actualLoads[shardIdx] = (actualLoads[shardIdx] ?? 0) - test.duration;
      if (isNewFile) shardFiles[shardIdx]?.delete(test.file);
      shardTests[shardIdx]?.pop();
      fileRemaining.set(test.file, (fileRemaining.get(test.file) ?? 0) + 1);
    }

    return true;
  }

  // Only run search for reasonable input sizes
  if (tests.length <= 50) {
    search(0);
  }

  // Return actual makespan (without penalties) for user-facing output
  const actualMakespan =
    bestAssignment.length > 0
      ? Math.max(...bestAssignment.map((a) => a.expectedDuration))
      : 0;

  return {
    assignments: bestAssignment,
    makespan: actualMakespan,
    isOptimal,
  };
}

/**
 * Simple LPT algorithm for internal use, with optional file affinity penalty.
 *
 * When fileAffinityPenalty > 0, effective loads include the penalty for each
 * new file introduced to a shard. The returned expectedDuration and makespan
 * reflect effective loads so the CKK search can use them as an upper bound.
 */
function assignWithLPTInternal(
  sortedTests: TestWithDuration[],
  numShards: number,
  fileAffinityPenalty = 0,
  fileTestCounts: Map<string, number> = new Map(),
  fileRemaining: Map<string, number> = new Map(),
): { assignments: TestShardAssignment[]; makespan: number } {
  const shards: TestShardAssignment[] = Array.from(
    { length: numShards },
    (_, i) => ({
      shardIndex: i + 1,
      tests: [],
      expectedDuration: 0,
    }),
  );

  // Track effective loads (with penalty) separately from actual durations
  const effectiveLoads = new Array(numShards).fill(0) as number[];
  const actualLoads = new Array(numShards).fill(0) as number[];
  const shardFiles: Set<string>[] = Array.from(
    { length: numShards },
    () => new Set<string>(),
  );

  for (const test of sortedTests) {
    // Find shard with minimum effective load, with file-aware tiebreaking
    let minIdx = 0;
    let minEffective = effectiveLoads[0] ?? 0;
    let minHasFile = shardFiles[0]?.has(test.file) ?? false;

    for (let i = 1; i < numShards; i++) {
      const effective = effectiveLoads[i] ?? 0;
      const hasFile = shardFiles[i]?.has(test.file) ?? false;

      if (
        effective < minEffective ||
        (effective === minEffective && hasFile && !minHasFile)
      ) {
        minEffective = effective;
        minIdx = i;
        minHasFile = hasFile;
      }
    }

    let penalty = 0;
    if (fileAffinityPenalty > 0 && !shardFiles[minIdx]?.has(test.file)) {
      const total = fileTestCounts.get(test.file) ?? 1;
      const remaining = fileRemaining.get(test.file) ?? 1;
      penalty = Math.round(fileAffinityPenalty * (remaining / total));
    }

    const shard = shards[minIdx];
    if (shard) {
      shard.tests.push(test.testId);
      effectiveLoads[minIdx] =
        (effectiveLoads[minIdx] ?? 0) + test.duration + penalty;
      actualLoads[minIdx] = (actualLoads[minIdx] ?? 0) + test.duration;
      shard.expectedDuration = actualLoads[minIdx] ?? 0;
      shardFiles[minIdx]?.add(test.file);
      fileRemaining.set(test.file, (fileRemaining.get(test.file) ?? 1) - 1);
    }
  }

  // Makespan uses effective loads so CKK can prune against it
  const makespan = effectiveLoads.length > 0 ? Math.max(...effectiveLoads) : 0;

  return { assignments: shards, makespan };
}

/**
 * Create empty shard assignments
 */
function createEmptyAssignments(numShards: number): TestShardAssignment[] {
  return Array.from({ length: numShards }, (_, i) => ({
    shardIndex: i + 1,
    tests: [],
    expectedDuration: 0,
  }));
}

/**
 * Assign one test per shard when there are more shards than tests
 */
function assignOnePerShard(
  tests: TestWithDuration[],
  numShards: number,
): CKKResult {
  const assignments = createEmptyAssignments(numShards);

  tests.forEach((test, i) => {
    const assignment = assignments[i];
    if (assignment) {
      assignment.tests.push(test.testId);
      assignment.expectedDuration = test.duration;
    }
  });

  const makespan =
    tests.length > 0 ? Math.max(...tests.map((t) => t.duration)) : 0;

  return {
    assignments,
    makespan,
    isOptimal: true,
  };
}

/**
 * Calculate theoretical lower bound for makespan
 * This is the best possible makespan if we could partition perfectly
 */
export function calculateLowerBound(
  tests: TestWithDuration[],
  numShards: number,
): number {
  if (tests.length === 0) return 0;

  const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);
  const maxSingleTest = Math.max(...tests.map((t) => t.duration));

  // Lower bound is max of: largest single item OR total/shards
  return Math.max(maxSingleTest, Math.ceil(totalDuration / numShards));
}
