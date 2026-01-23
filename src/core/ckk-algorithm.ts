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

  // Sort tests by duration descending for better pruning
  const sortedTests = [...tests].sort((a, b) => b.duration - a.duration);

  // Get LPT solution as upper bound
  const lptResult = assignWithLPTInternal(sortedTests, numShards);
  let bestMakespan = lptResult.makespan;
  let bestAssignment = lptResult.assignments;
  let isOptimal = false;

  // For small inputs, try to find optimal solution
  const startTime = Date.now();

  // Branch and bound search
  const shardLoads = new Array(numShards).fill(0) as number[];
  const shardTests: string[][] = Array.from({ length: numShards }, () => []);

  function search(testIndex: number): boolean {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      return false; // Timeout, stop search
    }

    // All tests assigned
    if (testIndex >= sortedTests.length) {
      const currentMakespan = Math.max(...shardLoads);
      if (currentMakespan < bestMakespan) {
        bestMakespan = currentMakespan;
        bestAssignment = shardLoads.map((load, i) => ({
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
    const remainingDuration = sortedTests
      .slice(testIndex)
      .reduce((sum, t) => sum + t.duration, 0);
    const currentMax = Math.max(...shardLoads);
    const totalAfter =
      shardLoads.reduce((sum, l) => sum + l, 0) + remainingDuration;
    const lowerBound = Math.max(currentMax, Math.ceil(totalAfter / numShards));

    // Prune if lower bound exceeds best
    if (lowerBound >= bestMakespan) {
      return true;
    }

    // Try assigning to each shard, starting with least loaded
    const shardOrder = shardLoads
      .map((load, i) => ({ load, index: i }))
      .sort((a, b) => a.load - b.load)
      .map((s) => s.index);

    // Skip duplicate loads to avoid redundant exploration
    const seenLoads = new Set<number>();

    for (const shardIdx of shardOrder) {
      const load = shardLoads[shardIdx];
      if (load === undefined) continue;

      // Skip if we've already tried a shard with this load
      if (seenLoads.has(load)) {
        continue;
      }
      seenLoads.add(load);

      // Prune: if adding to this shard exceeds best makespan, skip
      if (load + test.duration >= bestMakespan) {
        continue;
      }

      // Assign test to shard
      shardLoads[shardIdx] = load + test.duration;
      shardTests[shardIdx]?.push(test.testId);

      const completed = search(testIndex + 1);
      if (!completed) {
        // Timeout - restore and return
        shardLoads[shardIdx] = load;
        shardTests[shardIdx]?.pop();
        return false;
      }

      // Restore state for backtracking
      shardLoads[shardIdx] = load;
      shardTests[shardIdx]?.pop();
    }

    return true;
  }

  // Only run search for reasonable input sizes
  if (tests.length <= 50) {
    search(0);
  }

  return {
    assignments: bestAssignment,
    makespan: bestMakespan,
    isOptimal,
  };
}

/**
 * Simple LPT algorithm for internal use
 */
function assignWithLPTInternal(
  sortedTests: TestWithDuration[],
  numShards: number,
): { assignments: TestShardAssignment[]; makespan: number } {
  const shards: TestShardAssignment[] = Array.from(
    { length: numShards },
    (_, i) => ({
      shardIndex: i + 1,
      tests: [],
      expectedDuration: 0,
    }),
  );

  for (const test of sortedTests) {
    // Find shard with minimum load
    let minShard = shards[0];
    for (const shard of shards) {
      if (minShard && shard.expectedDuration < minShard.expectedDuration) {
        minShard = shard;
      }
    }

    if (minShard) {
      minShard.tests.push(test.testId);
      minShard.expectedDuration += test.duration;
    }
  }

  const makespan = Math.max(...shards.map((s) => s.expectedDuration));

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
