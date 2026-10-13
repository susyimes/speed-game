import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createApp, passwordHash } from '../server/app.mjs';
import { MUSIC_IDS, EFFECT_IDS, AUDIO_REVISION } from '../game/audio-cues.ts';

const root = new URL('../public/audio/', import.meta.url);
test('all runtime audio ships in both formats with matching provenance and bounded size', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  let bytes = 0;
  for (const id of [...MUSIC_IDS, ...EFFECT_IDS]) for (const format of ['ogg', 'mp3']) {
    const name = `${id}.${format}`, entry = manifest.files[name], file = readFileSync(new URL(name, root));
    assert(entry, name); assert.equal(entry.bytes, file.length, name);
    assert.equal(entry.sha256, createHash('sha256').update(file).digest('hex'), name);
    assert(entry.source_sha256.length === 64); assert(Number.isInteger(entry.seed));
    assert.equal(entry.sample_rate, entry.kind === 'music' ? 48000 : 44100); assert(entry.duration_seconds > .1);
    assert(entry.duration_seconds <= 55); assert(file.length > 1000);
    if (format === 'ogg') {
      assert.equal(file.subarray(0, 4).toString(), 'OggS');
      assert(entry.peak_dbfs < -.5, `${name}: ${entry.peak_dbfs} dBFS`);
      if (entry.loop) assert(entry.seam_delta < .035, `${name}: seam ${entry.seam_delta}`);
    }
    bytes += file.length;
  }
  assert.equal(Object.keys(manifest.files).length, 32);
  assert(bytes < 12_000_000, `Audio payload unexpectedly large: ${bytes}`);
  assert.equal(manifest.audio_revision, AUDIO_REVISION, 'runtime cache revision follows remastered files');
  for (const id of MUSIC_IDS) {
    assert(manifest.files[`${id}.ogg`].duration_seconds >= 16);
    assert.equal(manifest.files[`${id}.ogg`].generator, 'ACE-Step 1.5');
    assert(manifest.files[`${id}.ogg`].loop);
    assert.equal(manifest.files[`${id}.ogg`].channels, 2);
    assert.equal(manifest.files[`${id}.ogg`].encoding, 'Vorbis q8');
    assert.equal(manifest.files[`${id}.mp3`].encoding, 'MP3 CBR 320 kbps');
  }
  for (const id of EFFECT_IDS) assert.equal(manifest.files[`${id}.ogg`].generator, 'Dasheng-AudioGen');
});

test('the production static server delivers every audio asset with the right MIME and bytes', async t => {
  const parent = path.resolve('work/audio-http-tests'); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(path.join(parent, 'case-'));
  const app = createApp({ dbPath: path.join(directory, 'test.sqlite'), staticDir: fileURLToPath(new URL('../public/', import.meta.url)),
    adminPasswordHash: passwordHash('audio-test-only-password'), publicOrigin: 'http://127.0.0.1', secureCookies: false, trustProxy: false, now: Date.now, rateLimits: false });
  t.after(async () => { await app.close(); assert.equal(path.dirname(path.resolve(directory)), parent); rmSync(directory, { recursive: true }); });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const address = app.server.address(); assert(address && typeof address !== 'string');
  await Promise.all([...MUSIC_IDS, ...EFFECT_IDS].flatMap(id => ['ogg', 'mp3'].map(async format => {
    const name = `${id}.${format}`, response = await fetch(`http://127.0.0.1:${address.port}/audio/${name}`);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('content-type'), format === 'ogg' ? 'audio/ogg' : 'audio/mpeg');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(new URL(name, root)), name);
  })));
});
