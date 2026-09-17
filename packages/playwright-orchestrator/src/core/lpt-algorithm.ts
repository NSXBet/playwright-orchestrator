import type {
  AssignResult,
  FileWithDuration,
  ShardAssignment,
} from './types.js';

/**
 * Longest Processing Time First (LPT) algorithm for load balancing
 *
 * This greedy algorithm assigns jobs to workers by:
 * 1. Sorting jobs by duration (descending)
 * 2. Assigning each job to the worker with the smallest current load
 *
 * Time complexity: O(n log n) for sorting + O(n log k) for assignment = O(n log n)
 * where n = number of files, k = number of shards
 *
 * @param files - Files with their durations
 * @param numShards - Number of shards to distribute across
 * @returns Shard assignments with expected durations
 */
export function assignWithLPT(
  files: FileWithDuration[],
  numShards: number,
): ShardAssignment[] {
  // Initialize shards
  const shards: ShardAssignment[] = Array.from(
    { length: numShards },
    (_, i) => ({
      shardIndex: i + 1, // 1-based index
      files: [],
      expectedDuration: 0,
    }),
  );

  if (files.length === 0) {
    return shards;
  }

  // Sort files by duration descending (longest first)
  const sortedFiles = [...files].sort((a, b) => b.duration - a.duration);

  // Assign each file to the shard with the smallest current load
  for (const file of sortedFiles) {
    // Find shard with minimum load
    let minShard = shards[0];
    for (const shard of shards) {
      if (minShard && shard.expectedDuration < minShard.expectedDuration) {
        minShard = shard;
      }
    }

    // Assign file to this shard
    if (minShard) {
      minShard.files.push(file.file);
      minShard.expectedDuration += file.duration;
    }
  }

  return shards;
}

/**
 * Convert shard assignments to the format expected by the CLI output
 */
export function formatAssignResult(
  assignments: ShardAssignment[],
  estimatedFiles: string[],
): AssignResult {
  const shards: Record<number, string[]> = {};
  const expectedDurations: Record<number, number> = {};
  let totalFiles = 0;

  for (const assignment of assignments) {
    shards[assignment.shardIndex] = assignment.files;
    expectedDurations[assignment.shardIndex] = assignment.expectedDuration;
    totalFiles += assignment.files.length;
  }

  return {
    shards,
    expectedDurations,
    totalFiles,
    estimatedFiles,
  };
}

/**
 * Calculate the balance metric (max/min ratio) for the assignment
 *
 * A perfectly balanced assignment would have a ratio of 1.0
 * The target is to keep this below 1.2 (20% difference)
 */
export function calculateBalanceRatio(assignments: ShardAssignment[]): number {
  const durations = assignments
    .map((a) => a.expectedDuration)
    .filter((d) => d > 0);

  if (durations.length === 0) {
    return 1.0;
  }

  const max = Math.max(...durations);
  const min = Math.min(...durations);

  return min > 0 ? max / min : 1.0;
}
