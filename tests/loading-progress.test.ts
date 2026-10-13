import test from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {LoadingTracker,loadingHint,READY_LOADING} from '../game/loading-progress.ts';
import {ASSET_DOWNLOADS,SCENERY} from '../game/assets.ts';

test('download weights match every shipped model, including the large characters',()=>{
  assert.equal(ASSET_DOWNLOADS.length,10);
  for(const file of ASSET_DOWNLOADS){
    const directory=(SCENERY as readonly string[]).includes(file.id)?'models/environment':'models';
    assert.equal(file.bytes,statSync(new URL(`../public/${directory}/${file.id}.glb`,import.meta.url)).size,file.id);
  }
});

test('small completed files cannot hide a mostly undownloaded character',()=>{
  let now=0;
  const tracker=new LoadingTracker([{id:'hero',bytes:9000},{id:'island',bytes:1000}],()=>now);
  tracker.update('island',0,true);now=1000;
  assert.equal(tracker.snapshot().percent,11);
  tracker.update('hero',4500);now=2000;
  const halfway=tracker.snapshot();
  assert.equal(halfway.percent,54);assert(halfway.remainingSeconds!>0);
  tracker.update('hero',4000);assert.equal(tracker.snapshot().percent,54);
  tracker.update('hero',9000);assert.equal(tracker.snapshot().stage,'preparing');
  tracker.update('hero',0,true);
  assert.equal(tracker.snapshot().percent,99);
  assert.equal(tracker.snapshot().remainingSeconds,null);
  assert.equal(READY_LOADING.percent,100);
});

test('estimates adapt to slow transfers and disappear during a stall',()=>{
  let now=0;const tracker=new LoadingTracker([{id:'hero',bytes:100000}],()=>now);
  assert.equal(tracker.snapshot().remainingSeconds,null);
  now=1000;tracker.update('hero',10000);const fast=tracker.snapshot();
  now=7000;tracker.update('hero',11000);const slow=tracker.snapshot();
  assert(slow.remainingSeconds!>fast.remainingSeconds!);
  now=15000;const stalled=tracker.snapshot();
  assert.equal(stalled.percent,slow.percent);assert.equal(stalled.stalled,true);
  assert.equal(stalled.remainingSeconds,null);assert.match(loadingHint(stalled),/网络/);
  now=16000;tracker.update('hero',21000);assert.equal(tracker.snapshot().stalled,false);
});

test('cached completion and preparation do not invent a remaining countdown',()=>{
  const tracker=new LoadingTracker([{id:'hero',bytes:1000}],()=>0);
  tracker.update('hero',0,true);const progress=tracker.snapshot();
  assert.equal(progress.percent,99);assert.equal(progress.remainingSeconds,null);
  assert.match(loadingHint(progress),/布置赛道/);
  assert.equal(loadingHint({...progress,stage:'downloading',remainingSeconds:63}),'预计还需约 1 分 5 秒');
});
