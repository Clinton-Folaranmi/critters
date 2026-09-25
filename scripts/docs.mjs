// Keeps the docs in step with docs/CREATURE_STUDY_SPEC.md, the single source
// of truth:
//
//   node scripts/docs.mjs --check    (npm run docs:check; CI)
//   node scripts/docs.mjs --write    (npm run docs:write)
//
// Checks: every row of the spec's QA table whose Threshold names a key in
// qa/thresholds.mjs shows exactly that limit in its Pass column; every
// script it names exists in package.json; every pass/fail qa:* script is in
// the table; files llms.txt links to exist. Writes (or, with --check,
// compares) the field manual's generated regions — the rules index, the QA
// table, the locomotion summary and the variant targets — from the spec.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe } from '../qa/lib/report.mjs';
import { THRESHOLDS } from '../qa/thresholds.mjs';

const SPEC = 'docs/CREATURE_STUDY_SPEC.md';
const MANUAL = 'docs/CREATURE_STUDY_FIELD_MANUAL.html';
const write = process.argv.includes('--write');
const spec = readFileSync(SPEC, 'utf8');
const problems = [];

/** The Markdown table between <!-- name:start --> and <!-- name:end -->, as rows of cells. */
function table(name) {
  const match = spec.match(new RegExp(`<!-- ${name}:start -->\\n([\\s\\S]*?)<!-- ${name}:end -->`));
  if (!match) {
    problems.push(`${SPEC} has no <!-- ${name}:start --> … <!-- ${name}:end --> table`);
    return { head: [], rows: [] };
  }
  const lines = match[1]
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('|'));
  const cells = (line) =>
    line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, '|'));
  return { head: cells(lines[0]), rows: lines.slice(2).map(cells) };
}

// ---- The QA table against the thresholds and the scripts ---------------------
const qa = table('qa-table');
const col = (name) => qa.head.indexOf(name);
const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
const named = new Set();
for (const row of qa.rows) {
  const [id] = row;
  const key = row[col('Threshold')].replace(/`/g, '');
  const pass = row[col('Pass')];
  if (key !== '—') {
    const limit = key.split('.').reduce((node, part) => node?.[part], THRESHOLDS);
    if (!limit) problems.push(`${id}: qa/thresholds.mjs has no ${key}`);
    else {
      const expected = describe(limit) + (limit.known ? ' · known issue' : '');
      if (pass !== expected)
        problems.push(`${id}: the spec says "${pass}", qa/thresholds.mjs (${key}) says "${expected}"`);
    }
  }
  const script = row[col('Script')].match(/npm run ([\w:-]+)/)?.[1];
  if (!script) problems.push(`${id}: no npm script named`);
  else if (!scripts[script]) problems.push(`${id}: package.json has no script ${script}`);
  else named.add(script);
}
const tools = new Set(['qa:stills', 'qa:node', 'qa:browser']);
for (const script of Object.keys(scripts)) {
  if (script.startsWith('qa:') && !tools.has(script) && !named.has(script))
    problems.push(`${script} measures something the spec's QA table doesn't list`);
}

// ---- llms.txt links ------------------------------------------------------------
if (existsSync('llms.txt')) {
  for (const [, path] of readFileSync('llms.txt', 'utf8').matchAll(/\]\(([^)#]+?)\)/g)) {
    if (!/^https?:/.test(path) && !existsSync(path)) problems.push(`llms.txt links to ${path}, which doesn't exist`);
  }
} else problems.push('llms.txt is missing');

// ---- The manual's generated regions ------------------------------------------
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (text) =>
  escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const htmlTable = ({ head, rows }, skip = []) => {
  const keep = head.map((_, i) => i).filter((i) => !skip.includes(head[i]));
  return [
    '<div class="table-wrap">',
    '  <table>',
    `    <thead><tr>${keep.map((i) => `<th>${inline(head[i])}</th>`).join('')}</tr></thead>`,
    '    <tbody>',
    ...rows.map((row) => `      <tr>${keep.map((i) => `<td>${inline(row[i])}</td>`).join('')}</tr>`),
    '    </tbody>',
    '  </table>',
    '</div>',
  ].join('\n');
};

// Rules: "- **E-3 (MUST)** Text", grouped by the section they appear in.
const rulesHtml = (() => {
  const out = [];
  let section = '';
  for (const line of spec.split('\n')) {
    const heading = line.match(/^## (\d+)\. (.+)$/);
    if (heading) section = `${heading[1]}. ${heading[2]}`;
    const rule = line.match(/^- \*\*([A-Z]+-R?\d+) \((MUST|SHOULD|MAY)\)\*\* (.+)$/);
    if (!rule) continue;
    if (out.at(-1)?.section !== section) out.push({ section, rules: [] });
    out.at(-1).rules.push(rule.slice(1));
  }
  return out
    .map(
      ({ section, rules }) =>
        `<h3>${inline(section)}</h3>\n<div class="rows">\n${rules
          .map(
            ([id, level, text]) =>
              `  <div class="row"><span class="tag${level === 'MUST' ? '' : ' soft'}">${id}</span><span><b>${level}</b> ${inline(text)}</span></div>`,
          )
          .join('\n')}\n</div>`,
    )
    .join('\n');
})();

const regions = {
  rules: rulesHtml,
  qa: htmlTable(qa, ['Threshold']),
  locomotion: htmlTable(table('locomotion-summary')),
  variants: htmlTable(table('variants')),
};

let manual = readFileSync(MANUAL, 'utf8');
for (const [name, html] of Object.entries(regions)) {
  const pattern = new RegExp(`(<!-- spec:${name}:start[^>]*-->\\n)[\\s\\S]*?(<!-- spec:${name}:end -->)`);
  if (!pattern.test(manual)) {
    problems.push(`${MANUAL} has no <!-- spec:${name}:start --> … <!-- spec:${name}:end --> region`);
    continue;
  }
  const next = manual.replace(pattern, (_, start, end) => `${start}${html}\n${end}`);
  if (next !== manual && !write) problems.push(`${MANUAL}: the ${name} region is out of date (npm run docs:write)`);
  manual = next;
}
if (write) writeFileSync(MANUAL, manual);

if (problems.length) {
  console.error(`docs: ${problems.length} problem${problems.length > 1 ? 's' : ''}\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else
  console.log(
    `docs: the spec, qa/thresholds.mjs, package.json, llms.txt and the manual agree (${qa.rows.length} QA rows).`,
  );
