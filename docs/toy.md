# Bilibili Toy edition

Run npm run build:toy, then npm run preview:toy. Upload dist-toy/godspeed-toy.zip.
The preview serves that exact ZIP at http://127.0.0.1:5199/toy-fixture/ without route fallback.

The builder uses the fixed ignored work/toy/ folder. It checks its source patch anchors,
typechecks the staged player app, builds a Vite client entry, verifies the package and writes
a deterministic ZIP. The normal vinext build and online records server remain unchanged.
The Toy edition keeps the existing English/Chinese interface, all three heroes and courses,
touch controls, original geometry, textures, animation and audio.

Toy's file whitelist filters .glb and .txt. The ten self-contained GLBs are packaged
byte for byte as .data, with matching runtime URLs; Three.js detects their GLB headers.
All three heroes retain their five clips and embedded textures. Text credits and licenses
use .md. toy-models.json records original paths and SHA-256 hashes. Verification checks
all ten payloads, embedded resources, all 32 audio files, relative resource URLs, root
index.html, the whitelist, and conservative 50,000,000-byte compressed/expanded limits.
Runtime dependency license notices are generated from installed packages.

Like the itch edition, this edition uses local race records and nicknames. It does not call
the visits, heartbeat, leaderboard or private admin APIs. The online leaderboard tab is
disabled, local records open by default, and the asset-credit wording identifies the current
sources rather than the old KayKit study. Nicknames are editable local text, so enable
Toy's visitor watermark on publication. No Toy identity, cloud-save or ranking SDK is used.

Before submitting, check the actual Toy preview: model loading, hero/course selection,
Chinese/English, start and movement/abilities, pause, audio controls, and local records.
Browser viewport testing is not a physical phone or Bilibili App certification.

Official format reference: https://www.bilibili.com/toy/publish/guide/faq (checked 2026-10-24).
