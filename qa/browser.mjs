// Runs one browser check (qa/browser/<name>.mjs) in Playwright's headless
// shell against freshly built pages:
//
//   npm run qa:<name>            e.g. npm run qa:luma
//   node qa/browser.mjs <name> [--flags]
//
// Each check gets { page, site, prodSite, pages, report, opts }:
//   site      the demo with the dev helpers (dist/site-dev), served on a free port
//   prodSite  the demo as shipped (dist/site)
//   pages     file:// URL of qa/.out/pages (bake.html, dev-frogs.html, prod-frogs.html)
// and reports pass/fail through `report` (the exit code follows).
// QA_CONSOLE=1 prints the page's console afterwards.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from '../scripts/serve.mjs';
import { withPage } from './lib/chrome.mjs';
import { PAGES, buildNodeModules, buildPages, buildSites } from './lib/prepare.mjs';
import { createReport, flags } from './lib/report.mjs';

const name = process.argv[2];
if (!name) {
  console.error('Usage: node qa/browser.mjs <check>');
  process.exit(1);
}
const check = await import(`./browser/${name}.mjs`);
await Promise.all([buildNodeModules(), buildPages(), buildSites()]);
mkdirSync('qa/.out/shots', { recursive: true });
const dev = await serve('dist/site-dev');
const prod = await serve('dist/site');
const report = createReport(name);
try {
  await withPage(
    (page) =>
      check.default({
        page,
        report,
        opts: flags(process.argv.slice(3)),
        site: `${dev.url}frogs/`,
        prodSite: `${prod.url}frogs/`,
        pages: pathToFileURL(resolve(PAGES)).href + '/',
      }),
    check.browser ?? {},
  );
} catch (error) {
  report.expect(
    'ran to the end',
    false,
    String(error?.stack ?? error)
      .split('\n')
      .slice(0, 4)
      .join(' | '),
  );
} finally {
  await dev.close();
  await prod.close();
}
report.finish();
