import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';

export default class FilterReport extends Command {
  static override description =
    'Remove orchestrator-skipped tests from a Playwright JSON report';

  static override examples = [
    '<%= config.bin %> filter-report --report-file ./results.json',
    '<%= config.bin %> filter-report --report-file ./merged.json --output-file ./filtered.json',
  ];

  static override flags = {
    'report-file': Flags.string({
      char: 'r',
      description: 'Path to Playwright JSON report file',
      required: true,
    }),
    'output-file': Flags.string({
      char: 'o',
      description:
        'Path to write filtered report (defaults to overwriting input)',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show verbose output',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(FilterReport);

    const reportPath = path.resolve(flags['report-file']);

    if (!fs.existsSync(reportPath)) {
      this.warn(`Report file not found: ${reportPath}`);
      return;
    }

    let report: { suites?: unknown[] };
    try {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch {
      this.error(`Failed to parse report: ${reportPath}`);
    }

    if (!report.suites) {
      this.warn('Report has no suites, nothing to filter');
      return;
    }

    const suites = report.suites as Array<Record<string, unknown>>;
    const beforeCount = this.countSpecs(suites);
    this.filterSuites(suites);
    const afterCount = this.countSpecs(suites);
    const removed = beforeCount - afterCount;

    const outputPath = flags['output-file']
      ? path.resolve(flags['output-file'])
      : reportPath;
    fs.writeFileSync(outputPath, JSON.stringify(report));

    if (flags.verbose || removed > 0) {
      this.log(
        `Filtered report: ${beforeCount} → ${afterCount} specs (removed ${removed} orchestrator-skipped)`,
      );
    }
  }

  /**
   * Remove specs where ALL tests are orchestrator-skipped
   * (status "skipped" with annotation "Not in shard").
   * Prune empty suites after removal.
   */
  private filterSuites(suites: Array<Record<string, unknown>>): void {
    for (let i = suites.length - 1; i >= 0; i--) {
      const suite = suites[i];
      if (!suite) continue;

      if (Array.isArray(suite.specs)) {
        suite.specs = (suite.specs as Array<Record<string, unknown>>).filter(
          (spec) => {
            const tests = spec.tests as
              | Array<Record<string, unknown>>
              | undefined;
            if (!tests || tests.length === 0) return true;

            const allOrchestratorSkipped = tests.every((test) => {
              const status = test.status as string | undefined;
              if (status !== 'skipped') return false;
              const annotations = test.annotations as
                | Array<{ type?: string; description?: string }>
                | undefined;
              return annotations?.some(
                (a) => a.type === 'skip' && a.description === 'Not in shard',
              );
            });

            return !allOrchestratorSkipped;
          },
        );
      }

      if (Array.isArray(suite.suites)) {
        this.filterSuites(suite.suites as Array<Record<string, unknown>>);
      }

      const hasSpecs =
        Array.isArray(suite.specs) && (suite.specs as unknown[]).length > 0;
      const hasSubSuites =
        Array.isArray(suite.suites) && (suite.suites as unknown[]).length > 0;
      if (!hasSpecs && !hasSubSuites) {
        suites.splice(i, 1);
      }
    }
  }

  private countSpecs(suites: Array<Record<string, unknown>>): number {
    let count = 0;
    for (const suite of suites) {
      if (Array.isArray(suite.specs))
        count += (suite.specs as unknown[]).length;
      if (Array.isArray(suite.suites))
        count += this.countSpecs(
          suite.suites as Array<Record<string, unknown>>,
        );
    }
    return count;
  }
}
