import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const allowed = new Set('html htm css js json wasm data md csv tsv png jpg jpeg gif svg webp ico woff2 woff ttf eot mp3 wav ogg m4a mp4 webm atlas ani part nani unityweb'.split(' '));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifyToy(directory, root = process.cwd()) {
  const files = [];
  function walk(path, prefix = '') {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(path, entry.name), prefix + entry.name + '/');
      else files.push(prefix + entry.name);
    }
  }
  walk(directory);
  assert(files.includes('index.html'), 'Missing root entry');
  let expandedBytes = 0;
  for (const file of files) {
    assert(allowed.has(extname(file).slice(1)), 'Toy filters: ' + file);
    assert(!/(^|\/)(\.env|\.git|admin|server|node_modules)(\/|$)/.test(file), 'Private path: ' + file);
    const bytes = readFileSync(join(directory, file));
    expandedBytes += bytes.length;
    if (/\.(html|js|css)$/.test(file)) {
      const source = bytes.toString('utf8');
      assert(!/["'\x60]\/(?:models|audio|assets|credits|_next)\b/.test(source), 'Absolute resource path: ' + file);
      assert(!source.includes('/api/play/') && !source.includes('/api/leaderboard') && !source.includes('/api/admin/'), 'Backend dependency: ' + file);
      assert(!/https?:\/\/[^\s"'\x60]*\.(?:js|css|glb|data|ogg|mp3)(?:["'\x60?])/.test(source), 'External asset dependency: ' + file);
    }
  }
  assert(expandedBytes < 50_000_000, 'Expanded package exceeds 50 MB');
  const manifest = JSON.parse(readFileSync(join(directory, 'toy-models.json'), 'utf8'));
  assert.equal(manifest.models.length, 10);
  assert.equal(files.filter(file => file.endsWith('.data')).length, 10);
  let animationClips = 0;
  for (const model of manifest.models) {
    const bytes = readFileSync(join(directory, model.path));
    assert.equal(bytes.length, model.bytes);
    assert.equal(hash(bytes), model.sha256);
    assert.equal(hash(bytes), hash(readFileSync(join(root, 'public', model.sourcePath))));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert(json.scenes?.length && json.meshes?.length, 'Missing model scene: ' + model.path);
    assert((json.buffers ?? []).every(buffer => !buffer.uri), 'External model buffer');
    assert((json.images ?? []).every(image => image.bufferView !== undefined || image.uri?.startsWith('data:')), 'External model texture');
    animationClips += (json.animations ?? []).length;
    if (!model.path.includes('/environment/')) {
      assert.deepEqual(json.animations.map(clip => clip.name).sort(), ['Boost', 'Hit', 'Idle', 'Run', 'Warmup']);
      assert(json.skins?.length, 'Character rig missing');
    }
  }
  for (const [original, packaged] of [['credits.txt', 'credits.md'], ['audio/CREDITS.txt', 'audio/CREDITS.md']]) {
    assert.equal(readFileSync(join(directory, packaged), 'utf8'), readFileSync(join(root, 'public', original), 'utf8'));
  }
  const audioFiles = files.filter(file => /\.(ogg|mp3)$/.test(file));
  assert.equal(audioFiles.length, 32);
  for (const file of audioFiles) assert.equal(hash(readFileSync(join(directory, file))), hash(readFileSync(join(root, 'public', file))));
  const result = { files: files.length, expandedBytes, models: 10, animationClips, audioFiles: audioFiles.length };
  console.log('Toy contract: ' + JSON.stringify(result));
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verifyToy(resolve(process.argv[2] ?? 'work/toy/dist'));
