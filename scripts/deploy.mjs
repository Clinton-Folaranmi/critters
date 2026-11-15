// Builds the site and uploads dist/site to Vercel as the production deployment:
//
//   npm run deploy
//
// The site is deployed from this folder, not built from git. The project link
// (which Vercel project and account) is .vercel/project.json at the repository
// root, ignored by git; `npx vercel login` signs the command line in once.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const link = '.vercel/project.json';
if (!existsSync(link)) {
  console.error(`${link} is missing: it holds the Vercel projectId and orgId for the site.`);
  process.exit(1);
}
const { projectId, orgId } = JSON.parse(readFileSync(link, 'utf8'));
execFileSync('npm', ['run', 'build:site'], { stdio: 'inherit' });
execFileSync('npx', ['--yes', 'vercel@latest', 'deploy', 'dist/site', '--prod', '--yes'], {
  stdio: 'inherit',
  env: { ...process.env, VERCEL_ORG_ID: orgId, VERCEL_PROJECT_ID: projectId },
});
