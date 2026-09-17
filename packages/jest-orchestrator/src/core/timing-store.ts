import { DEFAULT_EMA_ALPHA, DEFAULT_PRUNE_DAYS } from "./constants.js";
import type { ShardTimingArtifact, TestTimingData, TimingData } from "./types.js";
import { identityKey, TIMING_DATA_VERSION } from "./types.js";

/**
 * Merge per-shard timing artifacts into the store using EMA smoothing.
 * New tests get their first measurement as-is; unknown projects/files
 * are created on demand.
 */
export function mergeTimingData(
  existing: TimingData | null,
  artifacts: ShardTimingArtifact[],
  alpha: number = DEFAULT_EMA_ALPHA,
): TimingData {
  const merged: TimingData = existing
    ? {
        version: TIMING_DATA_VERSION,
        updatedAt: new Date().toISOString(),
        projects: structuredClone(existing.projects),
      }
    : {
        version: TIMING_DATA_VERSION,
        updatedAt: new Date().toISOString(),
        projects: {},
      };

  for (const artifact of artifacts) {
    let project = merged.projects[artifact.project];
    if (!project) {
      project = { files: {} };
      merged.projects[artifact.project] = project;
    }
    for (const m of artifact.measurements) {
      const key = identityKey({
        project: artifact.project,
        file: m.file,
        fullName: m.fullName,
      });
      const prev = project.files[key];
      const next: TestTimingData = prev
        ? {
            duration: calculateEMA(prev.duration, m.duration, alpha),
            runs: prev.runs + 1,
            lastRun: new Date().toISOString(),
          }
        : { duration: m.duration, runs: 1, lastRun: new Date().toISOString() };
      project.files[key] = next;
    }
  }
  merged.updatedAt = new Date().toISOString();
  return merged;
}

/** Exponential moving average: alpha * new + (1 - alpha) * old. */
export function calculateEMA(
  oldDuration: number,
  newDuration: number,
  alpha: number = DEFAULT_EMA_ALPHA,
): number {
  return Math.round(alpha * newDuration + (1 - alpha) * oldDuration);
}

/**
 * Drop entries not seen in current discovery and entries older than
 * pruneDays. Store keys are identity keys (base64url), so freshness
 * check is a plain set membership plus timestamp comparison.
 */
export function pruneTimingData(
  data: TimingData,
  currentTestKeys: ReadonlySet<string>,
  days: number = DEFAULT_PRUNE_DAYS,
): TimingData {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const pruned: TimingData = {
    version: data.version,
    updatedAt: new Date().toISOString(),
    projects: {},
  };
  for (const [projectName, project] of Object.entries(data.projects)) {
    const files: Record<string, TestTimingData> = {};
    for (const [key, entry] of Object.entries(project.files)) {
      if (Date.parse(entry.lastRun) < cutoff) continue;
      if (!currentTestKeys.has(key)) continue;
      files[key] = entry;
    }
    if (Object.keys(files).length > 0) {
      pruned.projects[projectName] = { files };
    }
  }
  return pruned;
}
