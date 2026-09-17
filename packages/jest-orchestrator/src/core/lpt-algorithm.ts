import type { ShardAssignment, TestWithDuration } from './types.js';

/**
 * Longest Processing Time First (LPT): sort desc, always give the next
 * test to the currently-lightest shard. O(n log n + n log k).
 */
export function assignWithLPT(
  tests: TestWithDuration[],
  numShards: number,
): ShardAssignment[] {
  const shards: ShardAssignment[] = Array.from(
    { length: numShards },
    (_, i) => ({ shard: i + 1, tests: [], expectedDuration: 0 }),
  );
  const sorted = [...tests].sort((a, b) => b.duration - a.duration);
  let rr = 0; // round-robin cursor for load ties
  for (const test of sorted) {
    let min = shards[0];
    if (!min) break;
    for (const s of shards) {
      if (s.expectedDuration < min.expectedDuration) min = s;
    }
    // Round-robin on load ties: identical-duration seeds (everything
    // estimated) would otherwise land entirely in shard 1.
    const minLoad = min.expectedDuration;
    const ties = shards.filter((s) => s.expectedDuration === minLoad);
    const pick = ties.length > 1 ? ties[rr++ % ties.length] : min;
    if (!pick) continue;
    pick.tests.push(test);
    pick.expectedDuration += test.duration;
  }
  return shards;
}
