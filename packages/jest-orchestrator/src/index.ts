/**
 * @nsxbet/jest-orchestrator
 *
 * Exact per-test Jest distribution across CI shards using historical
 * timing data: discovery via a never-matching pattern, exact allowlist
 * selection per shard (setupFilesAfterEnv shim), and loud
 * bidirectional verification that executed == assigned.
 */

export * from './core/index.js';
export const VERSION = '0.1.0';
