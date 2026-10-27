// Builds the headless agent with Bun: a single JavaScript file for Node 20+, or a
// standalone executable when --compile <target> is given (bun-linux-x64,
// bun-linux-arm64, bun-windows-x64, bun-darwin-arm64). Server URLs and the
// version are baked in the same way electron-vite does for the tray agent.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

const args = process.argv.slice(2);
const compileIdx = args.indexOf('--compile');
const target = compileIdx >= 0 ? args[compileIdx + 1] : null;

const defines = {
  __PORTAL_URL__: process.env.PORTAL_URL || 'https://portal.trycomp.ai',
  __API_URL__: process.env.API_URL || 'https://api.trycomp.ai',
  __AGENT_VERSION__: process.env.AGENT_VERSION || pkg.version,
};

const bunArgs = ['build', join(root, 'src/headless/main.ts')];
for (const [key, value] of Object.entries(defines)) {
  bunArgs.push('--define', `${key}=${JSON.stringify(value)}`);
}

let outfile;
if (target) {
  const ext = target.includes('windows') ? '.exe' : '';
  outfile = join(root, 'release', `comp-ai-agent-${target.replace(/^bun-/, '')}${ext}`);
  bunArgs.push('--compile', `--target=${target}`, '--outfile', outfile);
} else {
  outfile = join(root, 'dist/headless/comp-ai-agent.mjs');
  bunArgs.push('--target=node', '--format=esm', '--outfile', outfile);
}
mkdirSync(dirname(outfile), { recursive: true });

console.log(`bun ${bunArgs.join(' ')}`);
// No shell: cmd.exe would strip the quotes around the --define values.
const result = spawnSync(process.platform === 'win32' ? 'bun.exe' : 'bun', bunArgs, {
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  `\nheadless agent ${defines.__AGENT_VERSION__} -> ${outfile}\n  API ${defines.__API_URL__}`,
);
