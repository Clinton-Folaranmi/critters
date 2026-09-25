// Pass/fail reporting for the checks. Each measurement has a threshold
// (from qa/thresholds.mjs); the process exits non-zero if any fails.
// Results also go to qa/.out/results/<check>.json for comparing runs.
import { mkdirSync, writeFileSync } from 'node:fs';

const fmt = (value) =>
  typeof value === 'number'
    ? Number.isInteger(value)
      ? String(value)
      : String(+value.toPrecision(4))
    : JSON.stringify(value);

function describe(limit) {
  if (!limit) return '';
  const parts = [];
  if ('equals' in limit) parts.push(`= ${fmt(limit.equals)}`);
  if ('min' in limit && 'max' in limit) parts.push(`${fmt(limit.min)} … ${fmt(limit.max)}`);
  else if ('min' in limit) parts.push(`≥ ${fmt(limit.min)}`);
  else if ('max' in limit) parts.push(`≤ ${fmt(limit.max)}`);
  return parts.join(' ') + (limit.unit ? ` ${limit.unit}` : '');
}

export function createReport(check) {
  const rows = [];
  const report = {
    /** Records a value against a limit ({ min?, max?, equals?, unit? }); returns whether it passed. */
    measure(name, value, limit) {
      let pass = typeof value === 'number' ? Number.isFinite(value) : value !== undefined;
      if (limit && 'equals' in limit) pass &&= JSON.stringify(value) === JSON.stringify(limit.equals);
      if (limit && 'min' in limit) pass &&= value >= limit.min;
      if (limit && 'max' in limit) pass &&= value <= limit.max;
      // A limit with `known` is a design target the study doesn't meet yet, a
      // recorded issue: shown as KNOWN (with the note) but not failing the run.
      const status = pass ? 'PASS' : limit?.known ? 'KNOWN' : 'FAIL';
      rows.push({
        status,
        name,
        value,
        limit: describe(limit) + (status === 'KNOWN' ? ` — known issue: ${limit.known}` : ''),
      });
      return pass;
    },
    /** A yes/no requirement. */
    expect(name, ok, detail = '') {
      rows.push({ status: ok ? 'PASS' : 'FAIL', name, value: detail || (ok ? 'yes' : 'no'), limit: '' });
      return ok;
    },
    /** A number worth reading with no pass/fail (machine-dependent, or for reference). */
    info(name, value) {
      rows.push({ status: 'info', name, value, limit: '' });
    },
    get failed() {
      return rows.filter((row) => row.status === 'FAIL').length;
    },
    /** Prints the table, writes the JSON, and sets the exit code. */
    finish() {
      const width = Math.min(58, Math.max(...rows.map((row) => row.name.length), 10));
      console.log(`\n${check}`);
      for (const row of rows) {
        const value = typeof row.value === 'string' ? row.value : fmt(row.value);
        console.log(
          `  ${row.status.padEnd(4)}  ${row.name.padEnd(width)}  ${value}${row.limit ? `   (${row.limit})` : ''}`,
        );
      }
      const failed = report.failed;
      const passed = rows.filter((row) => row.status === 'PASS').length;
      const known = rows.filter((row) => row.status === 'KNOWN').length;
      const summary = failed ? `${failed} failed` : passed ? `all ${passed} passed` : 'done';
      console.log(`  ${summary}${known ? ` (and ${known} known issue${known > 1 ? 's' : ''} outside target)` : ''}`);
      mkdirSync('qa/.out/results', { recursive: true });
      writeFileSync(
        `qa/.out/results/${check}.json`,
        JSON.stringify({ check, at: new Date().toISOString(), rows }, null, 1),
      );
      if (failed) process.exitCode = 1;
      return failed;
    },
  };
  return report;
}

/** Reads --name=value flags (and bare --name as true). */
export function flags(argv = process.argv.slice(2)) {
  const out = {};
  for (const arg of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(arg);
    if (match) out[match[1]] = match[2] ?? true;
  }
  return out;
}
