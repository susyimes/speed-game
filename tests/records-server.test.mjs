import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {CURRENT_RULESET} from '../shared/ruleset.mjs';
import {createApp,passwordHash} from '../server/app.mjs';

const origin='https://speed.truebox.cn',password='test-only-random-management-password',hash=passwordHash(password);
async function setup(t,options={}){
 const parent=path.resolve('work/records-tests');fs.mkdirSync(parent,{recursive:true});const directory=fs.mkdtempSync(path.join(parent,'case-')),site=path.join(directory,'site');fs.mkdirSync(site);fs.writeFileSync(path.join(site,'index.html'),'<h1>Godspeed</h1>');fs.writeFileSync(path.join(site,'admin.html'),'<h1>管理登录</h1>');
 let time=Date.now();const config={dbPath:path.join(directory,'data.sqlite'),staticDir:site,adminPasswordHash:hash,publicOrigin:origin,secureCookies:true,rateLimits:false,now:()=>time,...options};let app=createApp(config);app.server.listen(0,'127.0.0.1');await once(app.server,'listening');let address=`http://127.0.0.1:${app.server.address().port}`;
 t.after(async()=>{await app.close();assert.equal(path.dirname(directory),parent);fs.rmSync(directory,{recursive:true});});
 return {advance:ms=>{time+=ms;},request:async(endpoint,data,cookie='',extra={})=>fetch(address+endpoint,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...extra},body:data===undefined?undefined:JSON.stringify(data)}),restart:async(beforeOpen)=>{await app.close();if(beforeOpen)beforeOpen(config.dbPath);app=createApp(config);app.server.listen(0,'127.0.0.1');await once(app.server,'listening');address=`http://127.0.0.1:${app.server.address().port}`;}};
}
const cookieFrom=res=>res.headers.get('set-cookie').split(';')[0];
async function login(s){const res=await s.request('/api/admin/login',{password});assert.equal(res.status,200);return cookieFrom(res);}
async function openVisit(s,nickname,cookie=''){const res=await s.request('/api/play/visit',{nickname},cookie);assert.equal(res.status,201);return {...await res.json(),cookie:cookie||cookieFrom(res)};}

test('records require admin authentication, reject foreign origins and invalidate logout sessions',async t=>{
 const s=await setup(t);assert.equal((await s.request('/api/admin/records')).status,401);assert.equal((await s.request('/api/admin/export.csv')).status,401);
 assert.equal((await s.request('/api/admin/login',{password:'wrong'})).status,401);assert.equal((await s.request('/api/admin/login',{password},'',{Origin:'https://foreign.test'})).status,403);
 const response=await s.request('/api/admin/login',{password}),cookie=cookieFrom(response);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Secure/);assert.equal((await s.request('/api/admin/records',undefined,cookie)).status,200);
 assert.equal((await s.request('/api/admin/logout',{},cookie)).status,200);assert.equal((await s.request('/api/admin/records',undefined,cookie)).status,401);
});
test('repeated visits share one player; starts and finishes are idempotent and survive a restart',async t=>{
 const s=await setup(t),v=await openVisit(s,'乘风小熊'),id=randomUUID(),start={visitId:v.visitId,runId:id,character:'hermes',course:0};
 assert.equal((await s.request('/api/play/start',start,v.cookie)).status,200);assert.equal((await s.request('/api/play/start',start,v.cookie)).status,200);
 s.advance(42000);const finish={visitId:v.visitId,runId:id,durationMs:41567,tokens:38,sonicMs:20234,bumps:1};assert.equal((await s.request('/api/play/finish',finish,v.cookie)).status,200);assert.equal((await s.request('/api/play/finish',finish,v.cookie)).status,200);
 await openVisit(s,'改名小熊',v.cookie);let admin=await login(s);let data=await (await s.request('/api/admin/records',undefined,admin)).json();assert.deepEqual(data.summary,{players:1,visits:2,starts:1,finishes:1,online:1});assert.equal(data.players[0].nickname,'改名小熊');assert.equal(data.players[0].best_ms,41567);
 await s.restart();admin=await login(s);data=await (await s.request('/api/admin/records',undefined,admin)).json();assert.equal(data.players[0].finishes,1);assert.equal(data.recentRuns[0].status,'finished');assert.equal(data.recentRuns[0].duration_ms,41567);
});
test('visits cannot write another player results; malformed and impossible results are rejected',async t=>{
 const s=await setup(t),a=await openVisit(s,'A'),b=await openVisit(s,'B'),id=randomUUID();
 assert.equal((await s.request('/api/play/start',{visitId:a.visitId,runId:id,character:'hermes',course:0},b.cookie)).status,404);
 assert.equal((await s.request('/api/play/start',{visitId:a.visitId,runId:id,character:'hermes',course:9},a.cookie)).status,400);
 assert.equal((await s.request('/api/play/start',{visitId:a.visitId,runId:id,character:'hermes',course:0},a.cookie)).status,200);
 assert.equal((await s.request('/api/play/finish',{visitId:a.visitId,runId:id,durationMs:-2,tokens:1,sonicMs:0,bumps:0},a.cookie)).status,400);
 assert.equal((await s.request('/api/play/visit',null)).status,400);
});
test('presence ages out, CSV escapes formulas, and static serving never exposes source or data',async t=>{
 const s=await setup(t),v=await openVisit(s,'=HYPERLINK("x")'),admin=await login(s);let data=await (await s.request('/api/admin/records',undefined,admin)).json();assert.equal(data.summary.online,1);
 s.advance(81000);data=await (await s.request('/api/admin/records',undefined,admin)).json();assert.equal(data.summary.online,0);
 assert.equal((await s.request('/api/play/heartbeat',{visitId:v.visitId,visible:true},v.cookie)).status,200);assert.equal((await s.request('/api/play/heartbeat',{visitId:v.visitId,visible:false},v.cookie)).status,200);data=await (await s.request('/api/admin/records',undefined,admin)).json();assert.equal(data.summary.online,0);
 const csv=await (await s.request('/api/admin/export.csv',undefined,admin)).text();assert(csv.includes('"\'=HYPERLINK(""x"")"'));
 for(const endpoint of ['/data.sqlite','/.env.production','/server/app.mjs','/%2e%2e%2fdata.sqlite'])assert.equal((await s.request(endpoint)).status,404);
 assert.equal((await s.request('/admin')).status,200);assert.equal((await s.request('/healthz')).status,200);
});
test('admin password attempts are rate limited independently of normal play',async t=>{
 const s=await setup(t,{rateLimits:true});for(let i=0;i<10;i++)assert.equal((await s.request('/api/admin/login',{password:'wrong'})).status,401);assert.equal((await s.request('/api/admin/login',{password})).status,429);assert.equal((await s.request('/api/play/visit',{nickname:'正常玩家'})).status,201);
});

async function completeRun(s,player,character,course,durationMs,ruleset=CURRENT_RULESET){
 const runId=randomUUID(),payload={visitId:player.visitId,runId};
 assert.equal((await s.request('/api/play/start',{...payload,character,course,ruleset},player.cookie)).status,200);
 s.advance(durationMs);
 assert.equal((await s.request('/api/play/finish',{...payload,durationMs,tokens:20,sonicMs:5000,bumps:0},player.cookie)).status,200);
}

test('public leaderboard filters courses and characters, keeps one best per player, and protects private records',async t=>{
 const s=await setup(t),a=await openVisit(s,'乘风'),b=await openVisit(s,'踏火'),unfinished=await openVisit(s,'未完赛');
 await completeRun(s,a,'hermes',0,42000);await completeRun(s,a,'hermes',0,36000);await completeRun(s,a,'nezha',0,38000);
 await completeRun(s,b,'nezha',0,35000);await completeRun(s,b,'djinn',1,25000);
 await s.request('/api/play/start',{visitId:unfinished.visitId,runId:randomUUID(),character:'djinn',course:0},unfinished.cookie);
 const response=await s.request('/api/leaderboard?course=0',undefined,a.cookie),board=await response.json();
 assert.equal(response.status,200);assert.equal(board.total,2);
 assert.deepEqual(board.entries.map(e=>[e.nickname,e.durationMs,e.rank,e.isMe]),[['踏火',35000,1,false],['乘风',36000,2,true]]);
 assert.equal(board.personalBest.nickname,'乘风');assert.equal(board.personalBest.rank,2);
 assert.deepEqual(Object.keys(board.entries[0]).sort(),['character','durationMs','isMe','nickname','rank']);
 const filtered=await (await s.request('/api/leaderboard?course=0&character=hermes')).json();
 assert.equal(filtered.total,1);assert.equal(filtered.entries[0].durationMs,36000);assert.equal(filtered.personalBest,null);
 const other=await (await s.request('/api/leaderboard?course=1')).json();assert.equal(other.entries[0].character,'djinn');
 const empty=await (await s.request('/api/leaderboard?course=2')).json();assert.equal(empty.total,0);assert.deepEqual(empty.entries,[]);
 for(const query of ['course=3','course=0x0','course=','course=0&character=unknown'])assert.equal((await s.request('/api/leaderboard?'+query)).status,400);
 assert.equal((await s.request('/api/admin/records')).status,401);
 await s.restart();assert.equal((await (await s.request('/api/leaderboard?course=0')).json()).total,2);
});

test('leaderboard shares tied ranks and returns the viewer best outside the first 50 places',async t=>{
 const s=await setup(t);let last;
 for(let i=0;i<52;i++){last=await openVisit(s,`跑者${i}`);await completeRun(s,last,'hermes',0,30000+Math.max(0,i-1)*100);}
 const board=await (await s.request('/api/leaderboard?course=0',undefined,last.cookie)).json();
 assert.equal(board.total,52);assert.equal(board.entries.length,50);
 assert.deepEqual(board.entries.slice(0,3).map(e=>e.rank),[1,1,3]);
 assert.equal(board.personalBest.rank,52);assert.equal(board.personalBest.nickname,'跑者51');
 assert.equal(board.entries.some(e=>e.isMe),false);
});

test('the beta leaderboard only contains new-rule finishes, even after restart',async t=>{
 const s=await setup(t),v=await openVisit(s,'新内测玩家');
 await completeRun(s,v,'hermes',0,18000,'legacy');await completeRun(s,v,'hermes',0,33000);
 await s.restart();const board=await (await s.request('/api/leaderboard?course=0',undefined,v.cookie)).json();
 assert.equal(board.personalBest.durationMs,33000);assert.equal(board.total,1);
 assert.equal((await s.request('/api/leaderboard?era=history')).status,400);
 assert.equal((await s.request('/api/play/start',{visitId:v.visitId,runId:randomUUID(),character:'hermes',course:0,ruleset:'future'},v.cookie)).status,400);
});

test('migrating the production v1 SQLite schema preserves historical runs, identities and admin login',async t=>{
 const s=await setup(t),v=await openVisit(s,'迁移前玩家');await completeRun(s,v,'hermes',0,19500,'legacy');
 await s.restart(dbPath=>{const db=new DatabaseSync(dbPath);db.exec('DROP INDEX runs_ruleset; ALTER TABLE runs DROP COLUMN ruleset; PRAGMA user_version=1');assert(!db.prepare('PRAGMA table_info(runs)').all().some(c=>c.name==='ruleset'));db.close();});
 const admin=await login(s),records=await (await s.request('/api/admin/records',undefined,admin)).json();assert.equal(records.summary.players,1);assert.equal(records.summary.finishes,1);assert.equal(records.recentRuns[0].duration_ms,19500);
 assert.equal((await (await s.request('/api/leaderboard')).json()).total,0);
 await completeRun(s,v,'hermes',0,34000);assert.equal((await (await s.request('/api/leaderboard',undefined,v.cookie)).json()).personalBest.durationMs,34000);
});

test('short-course clients remain recordable but cannot rank on the extended courses',async t=>{
 const s=await setup(t),v=await openVisit(s,'赛道改版玩家');await completeRun(s,v,'hermes',0,33000,'flow600-v1');
 assert.equal((await (await s.request('/api/leaderboard')).json()).total,0);
 await completeRun(s,v,'hermes',0,63000);const board=await (await s.request('/api/leaderboard',undefined,v.cookie)).json();assert.equal(board.personalBest.durationMs,63000);assert.equal(board.total,1);
});
