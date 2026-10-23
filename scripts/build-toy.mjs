import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { verifyToy } from './verify-toy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = resolve(root, 'work/toy');
// Only the fixed ignored Toy staging folder is rebuilt.
assert.equal(work, join(resolve(root), 'work', 'toy'));
assert.equal(dirname(dirname(work)), resolve(root));
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
for (const name of ['app', 'components', 'game', 'hooks', 'lib', 'shared', 'public', 'package.json']) {
  cpSync(join(root, name), join(work, name), { recursive: true });
}
// The static entry imports the player page only. Admin source is not distributed.
rmSync(join(work, 'app/admin'), { recursive: true, force: true });

function patch(path, before, after, expected = 1) {
  const file = join(work, path), source = readFileSync(file, 'utf8');
  assert.equal(source.split(before).length - 1, expected, 'Toy compatibility anchor changed: ' + path + ': ' + before);
  writeFileSync(file, source.replaceAll(before, after));
}
patch('game/assets.ts', String.fromCharCode(96) + '/models/', String.fromCharCode(96) + './models/', 2);
patch('game/assets.ts', '.glb', '.data', 2);
patch('game/audio.ts', '/audio/', './audio/');
patch('app/page.tsx', 'href="/credits.txt"', 'href="./credits.md"');
patch('app/AudioControls.tsx', 'href="/audio/CREDITS.txt"', 'href="./audio/CREDITS.md"');
for (const path of ['app/page.tsx', 'game/translations.ts']) {
  patch(path, '人物素材与授权 · KayKit / CC0 ↗', '当前素材来源与授权 ↗');
}
patch('game/translations.ts', 'Character assets & licenses · KayKit / CC0 ↗', 'Current asset sources and licenses ↗');

const recordsPath = join(work, 'game/records.ts');
const records = readFileSync(recordsPath, 'utf8');
const marker = '// Small, same-origin, best-effort writes.';
assert.equal(records.split(marker).length, 2, 'PlayRecorder anchor changed');
writeFileSync(recordsPath, records.split(marker)[0] + [
  '// Toy edition: local nicknames and race results; no visit or telemetry requests.',
  'export class PlayRecorder {',
  '  connect() { return Promise.resolve(); }',
  '  setNickname(value: string) { return saveNickname(value); }',
  '  begin(_character: CharacterId, _course: number) {}',
  '  observe(_snapshot: GameSnapshot) {}',
  '  finish(_snapshot: GameSnapshot) {}',
  '  abandon() {}',
  '  dispose() {}',
  '}',
  '',
].join('\n'));

patch('app/Leaderboard.tsx', "useState('online')", "useState('local')");
const leaderboardPath = join(work, 'app/Leaderboard.tsx');
const leaderboard = readFileSync(leaderboardPath, 'utf8').replaceAll('\r\n', '\n');
const fetchStart = leaderboard.indexOf("  useEffect(() => {\n    if (!open || scope");
const fetchEnd = leaderboard.indexOf('\n\n  return <Dialog', fetchStart);
assert(fetchStart > 0 && fetchEnd > fetchStart, 'Leaderboard effect anchor changed');
writeFileSync(leaderboardPath, leaderboard.slice(0, fetchStart) + leaderboard.slice(fetchEnd));
patch('app/Leaderboard.tsx', '<TabsTrigger value="online">', '<TabsTrigger value="online" disabled title={t("此版本仅提供本机纪录")}>');
patch('app/Leaderboard.tsx', 't("同一条赛道，看看谁更快。只计本次新版本的成绩。")', 't("保存在当前浏览器中，每个角色保留一项最佳。清除浏览器数据后，纪录也会清除。")');

const models = [];
function convertPublic(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), relative = prefix + entry.name;
    if (entry.isDirectory()) convertPublic(path, relative + '/');
    else if (entry.name.endsWith('.glb')) {
      const bytes = readFileSync(path), packagedPath = relative.replace(/\.glb$/, '.data');
      models.push({ sourcePath: relative, path: packagedPath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      renameSync(path, join(work, 'public', packagedPath));
    } else if (entry.name.endsWith('.txt')) renameSync(path, path.replace(/\.txt$/, '.md'));
  }
}
convertPublic(join(work, 'public'));
models.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(join(work, 'public/toy-models.json'), JSON.stringify({ distribution: 'bilibili-toy', models }, null, 2));
for (const name of ['LICENSE', 'ASSETS.md']) cpSync(join(root, name), join(work, 'public', name === 'LICENSE' ? 'LICENSE.md' : name));

// Collect notices from the installed runtime dependency graph, not a stale build.
function packageAt(name, from) {
  let directory = resolve(from);
  while (true) {
    const candidate = join(directory, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(directory);
    if (parent === directory) throw new Error('Missing runtime dependency: ' + name);
    directory = parent;
  }
}
const queue = ['react', 'react-dom', 'three', 'lucide-react', '@base-ui/react', 'clsx', 'class-variance-authority', 'tailwind-merge'].map(name => [name, root]);
const seen = new Set(), notices = [];
while (queue.length) {
  const [name, from] = queue.shift(), directory = packageAt(name, from);
  const info = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const id = info.name + '@' + info.version;
  if (seen.has(id)) continue;
  seen.add(id);
  const licenses = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isFile() && /^(licen[sc]e|copying|notice)(\.|$|-)/i.test(entry.name)).map(entry => entry.name).sort();
  notices.push(id + '\nLicense: ' + JSON.stringify(info.license) + '\n' + licenses.map(name => name + '\n' + readFileSync(join(directory, name), 'utf8')).join('\n'));
  for (const child of Object.keys(info.dependencies ?? {}).sort()) queue.push([child, directory]);
}
writeFileSync(join(work, 'public/THIRD-PARTY-LICENSES.md'), notices.join('\n\n--------------------\n\n'));
writeFileSync(join(work, 'index.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="icon" href="./favicon.svg"><title>神速 · GODSPEED</title></head><body><div id="root"></div><script type="module" src="./toy-main.tsx"></script></body></html>');
writeFileSync(join(work, 'toy-main.tsx'), [
  "import { createRoot } from 'react-dom/client';",
  "import Home from './app/page';",
  "import './app/globals.css';",
  "import './app/touch.css';",
  "import './app/home-menu.css';",
  "createRoot(document.getElementById('root')!).render(<Home />);",
].join('\n'));
writeFileSync(join(work, 'vite.config.ts'), [
  "import { defineConfig } from 'vite';",
  "import react from '@vitejs/plugin-react';",
  "import tailwindcss from '@tailwindcss/postcss';",
  "import { fileURLToPath } from 'node:url';",
  "export default defineConfig({ base: './', plugins: [react()],",
  "  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },",
  "  css: { postcss: { plugins: [tailwindcss()] } },",
  "  build: { outDir: 'dist', sourcemap: false } });",
].join('\n'));
const tsconfig = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'));
tsconfig.compilerOptions.incremental = false;
tsconfig.include = ['app/**/*.tsx', 'components/**/*.tsx', 'game/**/*.ts', 'lib/**/*.ts', 'hooks/**/*.ts', 'toy-main.tsx'];
tsconfig.exclude = ['node_modules'];
writeFileSync(join(work, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
function run(script, args) {
  const result = spawnSync(process.execPath, [join(root, 'node_modules', script), ...args], { cwd: work, stdio: 'inherit' });
  assert.equal(result.status, 0, 'Toy command failed: ' + script);
}
run('typescript/bin/tsc', ['--noEmit', '--project', 'tsconfig.json']);
run('vite/bin/vite.js', ['build']);
const report = await verifyToy(join(work, 'dist'), root);
const entries = {};
function collect(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name), name = prefix + entry.name;
    if (entry.isDirectory()) collect(path, name + '/');
    else entries[name] = [readFileSync(path), { mtime: new Date('2020-01-01T00:00:00Z') }];
  }
}
collect(join(work, 'dist'));
const zip = zipSync(entries, { level: 9 });
assert(zip.length < 50_000_000, 'Toy ZIP exceeds 50 MB');
mkdirSync(join(root, 'dist-toy'), { recursive: true });
writeFileSync(join(root, 'dist-toy/godspeed-toy.zip'), zip);
writeFileSync(join(root, 'dist-toy/verification.json'), JSON.stringify({ ...report, zipBytes: zip.length, sha256: createHash('sha256').update(zip).digest('hex'), platformSubmitted: false }, null, 2));
console.log('Toy ZIP: ' + join(root, 'dist-toy/godspeed-toy.zip') + ' (' + zip.length + ' bytes)');
