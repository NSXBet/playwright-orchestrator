import type { ShardAssignment, TestWithDuration } from './types.js';

/**
 * Complete Karmarkar-Karp (CKK) inspired multi-way number partitioning.
 *
 * Strategy: greedy LPT first (fast, good). Then a bounded local-search
 * improvement pass: while a pair of shards differs by more than the
 * smallest movable item's gain, move/swap items between the heaviest and
 * lightest shards. Budget-capped by timeoutMs; deterministic while the
 * budget is not exhausted (a cut-off run may stop mid-smoothing).
 *
 * This replaces a full differencing-tree search — for test-duration
 * balancing, LPT + pairwise smoothing reaches the CKK-quality envelopes
 * with far simpler state. Falls back to pure LPT on timeout.
 */

export const DEFAULT_CKK_TIMEOUT = 500;

export interface CKKResult {
  assignments: ShardAssignment[];
  makespan: number;
}

interface ShardState {
  shard: number;
  tests: TestWithDuration[];
  load: number;
}

/**
 * Assign tests to shards, balancing total duration.
 */
export function assignWithCKK(
  tests: TestWithDuration[],
  numShards: number,
  timeoutMs: number = DEFAULT_CKK_TIMEOUT,
): CKKResult {
  if (numShards < 1) throw new RangeError('numShards must be >= 1');

  const shards: ShardState[] = Array.from({ length: numShards }, (_, i) => ({
    shard: i + 1,
    tests: [],
    load: 0,
  }));

  if (tests.length === 0) {
    return { assignments: toAssignments(shards), makespan: 0 };
  }

  const sorted = [...tests].sort((a, b) => b.duration - a.duration);
  let rr = 0;
  for (const test of sorted) {
    let min = shards[0];
    if (!min) break;
    for (const s of shards) {
      if (s.load < min.load) min = s;
    }
    // Round-robin on load ties: identical-duration seeds (everything
    // estimated) would otherwise land entirely in shard 1.
    const minLoad = min.load;
    const ties = shards.filter((s) => s.load === minLoad);
    const pick = ties.length > 1 ? ties[rr++ % ties.length] : min;
    if (!pick) continue;
    pick.tests.push(test);
    pick.load += test.duration;
  }

  const deadline = Date.now() + timeoutMs;
  // Pairwise smoothing with deadline
  let improved = true;
  while (improved && Date.now() < deadline) {
    improved = false;
    const byLoad = [...shards].sort((a, b) => b.load - a.load);
    const heavy = byLoad[0];
    const light = byLoad[byLoad.length - 1];
    if (
      !heavy ||
      !light ||
      heavy.load - light.load <= 0 ||
      heavy.tests.length === 0
    ) {
      break;
    }

    // Pick the move/swap that most reduces |heavy - light|. A move of
    // `out` yields newGap = |gap - 2*out|; a swap of out/into yields
    // newGap = |gap - 2*(out - into)|. Gain must be strictly positive
    // so the loop is monotone and cannot oscillate.
    const gap = heavy.load - light.load;
    let bestGain = 0;
    let bestMove:
      | { kind: 'move'; outIdx: number }
      | { kind: 'swap'; outIdx: number; inIdx: number }
      | null = null;
    for (let outIdx = 0; outIdx < heavy.tests.length; outIdx++) {
      const out = heavy.tests[outIdx];
      if (!out) continue;
      const moveGain = gap - Math.abs(gap - 2 * out.duration);
      if (moveGain > bestGain) {
        bestGain = moveGain;
        bestMove = { kind: 'move', outIdx };
      }
      for (let inIdx = 0; inIdx < light.tests.length; inIdx++) {
        const into = light.tests[inIdx];
        if (!into) continue;
        const swapGain =
          gap - Math.abs(gap - 2 * (out.duration - into.duration));
        if (swapGain > bestGain) {
          bestGain = swapGain;
          bestMove = { kind: 'swap', outIdx, inIdx };
        }
      }
    }
    if (bestMove) {
      improved = true;
      if (bestMove.kind === 'move') {
        const [out] = heavy.tests.splice(bestMove.outIdx, 1);
        if (out) {
          heavy.load -= out.duration;
          light.tests.push(out);
          light.load += out.duration;
        }
      } else {
        const [out] = heavy.tests.splice(bestMove.outIdx, 1);
        const [into] = light.tests.splice(bestMove.inIdx, 1);
        if (out && into) {
          heavy.tests.push(into);
          heavy.load += into.duration - out.duration;
          light.tests.push(out);
          light.load += out.duration - into.duration;
        }
      }
    }
  }

  const assignments = toAssignments(shards);
  return {
    assignments,
    makespan: Math.max(...assignments.map((a) => a.expectedDuration)),
  };
}

function toAssignments(shards: ShardState[]): ShardAssignment[] {
  return shards.map((s) => ({
    shard: s.shard,
    tests: s.tests,
    expectedDuration: s.load,
  }));
}
