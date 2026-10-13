import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';

import {CURRENT_RULESET,ACCEPTED_RULESETS} from '../shared/ruleset.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const characters=new Set(['hermes','nezha','djinn']);
const sha=value=>createHash('sha256').update(value).digest('hex');
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const requireValue=(condition,message='请求内容不正确')=>{if(!condition)throw new HttpError(400,message);};
export function cleanNickname(value){return String(value??'').normalize('NFKC').replace(/[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,24);}
export function passwordHash(password,salt=randomBytes(16).toString('hex')){return `${salt}:${scryptSync(password,salt,32).toString('hex')}`;}
function checkPassword(password,encoded){const [salt,hash]=String(encoded).split(':');if(!salt||!hash||hash.length!==64)return false;const actual=scryptSync(password,salt,32),expected=Buffer.from(hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
function cookie(req,name){for(const item of String(req.headers.cookie??'').split(';')){const [key,...value]=item.trim().split('=');if(key===name)return value.join('=');}return '';}
function deviceName(ua){const os=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Macintosh/i.test(ua)?'Mac':/Linux/i.test(ua)?'Linux':'其他';const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'浏览器';return `${os} · ${browser}`;}
function csvCell(value){let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
async function readJson(req){requireValue(String(req.headers['content-type']??'').startsWith('application/json'),'请使用 JSON');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192)throw new HttpError(413,'请求过大');chunks.push(chunk);}let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'JSON 格式不正确');}requireValue(data!==null&&typeof data==='object'&&!Array.isArray(data));return data;}

export function createApp({dbPath,staticDir,adminPasswordHash,publicOrigin,secureCookies=true,trustProxy=false,now=Date.now,rateLimits=true}){
  if(!adminPasswordHash||!/^https?:\/\//.test(publicOrigin))throw new Error('ADMIN_PASSWORD_HASH and PUBLIC_ORIGIN are required');
  publicOrigin=new URL(publicOrigin).origin;
  const staticRoot=path.resolve(staticDir);
  if(dbPath!==':memory:')fs.mkdirSync(path.dirname(dbPath),{recursive:true,mode:0o700});
  const db=new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,nickname TEXT NOT NULL,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS visits(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),opened_at INTEGER NOT NULL,seen_at INTEGER NOT NULL,device TEXT NOT NULL,visible INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,visit_id TEXT NOT NULL REFERENCES visits(id),character TEXT NOT NULL CHECK(character IN ('hermes','nezha','djinn')),course INTEGER NOT NULL CHECK(course BETWEEN 0 AND 2),started_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,finished_at INTEGER,duration_ms INTEGER,tokens INTEGER,sonic_ms INTEGER,bumps INTEGER,progress REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'started' CHECK(status IN ('started','finished','abandoned')));
    CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS visits_player ON visits(player_id,seen_at);
    CREATE INDEX IF NOT EXISTS runs_visit ON runs(visit_id,started_at);
    CREATE INDEX IF NOT EXISTS players_last_seen ON players(last_seen DESC);
    CREATE INDEX IF NOT EXISTS runs_leaderboard ON runs(course,status,duration_ms);
    `);
  if(!db.prepare('PRAGMA table_info(runs)').all().some(column=>column.name==='ruleset'))db.exec("ALTER TABLE runs ADD COLUMN ruleset TEXT NOT NULL DEFAULT 'legacy'");
  db.exec('CREATE INDEX IF NOT EXISTS runs_ruleset ON runs(ruleset,course,status,duration_ms); PRAGMA user_version=2;');
  const rates=new Map();
  function limit(req,bucket,max,windowMs){if(!rateLimits)return;const ip=trustProxy?String(req.headers['x-real-ip']??req.socket.remoteAddress):req.socket.remoteAddress;const key=`${bucket}:${ip}`,time=now();let rate=rates.get(key);if(!rate||rate.until<time){rate={count:0,until:time+windowMs};rates.set(key,rate);}if(++rate.count>max)throw new HttpError(429,'操作过于频繁，请稍后再试');if(rates.size>5000)for(const [key,r]of rates)if(r.until<time)rates.delete(key);}
  function send(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(data));}
  function setCookie(res,name,value,maxAge,sameSite='Lax'){res.setHeader('Set-Cookie',`${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}${secureCookies?'; Secure':''}`);}
  function origin(req){if(req.headers.origin!==publicOrigin)throw new HttpError(403,'请求来源不正确');}
  function playerId(req){const token=cookie(req,'gs_player');if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new HttpError(401,'请刷新页面后重试');const id=sha(token);if(!db.prepare('SELECT id FROM players WHERE id=?').get(id))throw new HttpError(401,'请刷新页面后重试');return id;}
  function visit(req,id){requireValue(UUID.test(id??''));const player=playerId(req);if(!db.prepare('SELECT id FROM visits WHERE id=? AND player_id=?').get(id,player))throw new HttpError(404,'游玩记录不存在');return player;}
  function touch(id,player,visible=true){const time=now();db.prepare('UPDATE visits SET seen_at=?,visible=? WHERE id=?').run(time,visible?1:0,id);db.prepare('UPDATE players SET last_seen=? WHERE id=?').run(time,player);}
  function admin(req){const token=cookie(req,'gs_admin');if(!/^[A-Za-z0-9_-]{43}$/.test(token)||!db.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>?').get(sha(token),now()))throw new HttpError(401,'请先输入管理密码');}
  function queryFilter(url){const q=(url.searchParams.get('q')??'').trim().slice(0,48);return {q,pattern:'%'+q.replace(/[!%_]/g,'!$&')+'%'};}
  function playerRows(pattern,limit,offset){return db.prepare(`SELECT p.id,p.nickname,p.first_seen,p.last_seen,
      (SELECT COUNT(*) FROM visits v WHERE v.player_id=p.id) visits,
      (SELECT COUNT(*) FROM runs r JOIN visits v ON v.id=r.visit_id WHERE v.player_id=p.id) starts,
      (SELECT COUNT(*) FROM runs r JOIN visits v ON v.id=r.visit_id WHERE v.player_id=p.id AND r.status='finished') finishes,
      (SELECT MIN(r.duration_ms) FROM runs r JOIN visits v ON v.id=r.visit_id WHERE v.player_id=p.id AND r.status='finished') best_ms,
      (SELECT r.course FROM runs r JOIN visits v ON v.id=r.visit_id WHERE v.player_id=p.id AND r.status='finished' ORDER BY r.duration_ms LIMIT 1) best_course,
      (SELECT device FROM visits WHERE player_id=p.id ORDER BY seen_at DESC LIMIT 1) device,
      EXISTS(SELECT 1 FROM visits WHERE player_id=p.id AND visible=1 AND seen_at>?) online,
      (SELECT r.character FROM runs r JOIN visits v ON v.id=r.visit_id WHERE v.player_id=p.id ORDER BY r.started_at DESC LIMIT 1) last_character,
      (SELECT r.course FROM runs r JOIN visits v ON v.id=r.visit_id WHERE v.player_id=p.id ORDER BY r.started_at DESC LIMIT 1) last_course
      FROM players p WHERE p.nickname LIKE ? ESCAPE '!' OR p.id LIKE ? ESCAPE '!' ORDER BY p.last_seen DESC,p.id LIMIT ? OFFSET ?`).all(now()-80000,pattern,pattern,limit,offset);}
  async function route(req,res){
    const url=new URL(req.url,publicOrigin),pathname=url.pathname;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
    if(pathname==='/healthz'&&req.method==='GET'){db.prepare('SELECT 1').get();return send(res,200,{ok:true,service:'godspeed',storage:'sqlite',version:'records-1'});}
    if(pathname.startsWith('/api/')){
      if(req.method==='POST'){origin(req);limit(req,pathname==='/api/admin/login'?'login':'play',pathname==='/api/admin/login'?10:180,pathname==='/api/admin/login'?15*60000:60000);}
      if(pathname==='/api/leaderboard'&&req.method==='GET'){
        limit(req,'leaderboard',120,60000);
        const courseValue=url.searchParams.get('course')??'0',character=url.searchParams.get('character')??'all';
        requireValue(!url.searchParams.has('era')&&/^[0-2]$/.test(courseValue)&&(character==='all'||characters.has(character)),'请选择有效的赛道与角色');
        const course=Number(courseValue),token=cookie(req,'gs_player'),viewer=/^[A-Za-z0-9_-]{43}$/.test(token)?sha(token):'';
        // One personal best per player and filter. Ties share a rank; finish order
        // only makes the top-50 display deterministic. Never expose player IDs.
        const rows=db.prepare(`WITH attempts AS (
          SELECT p.id player_id,p.nickname,r.character,r.duration_ms,r.finished_at,r.id run_id,
          ROW_NUMBER() OVER(PARTITION BY p.id ORDER BY r.duration_ms,r.finished_at,r.id) attempt
          FROM runs r JOIN visits v ON v.id=r.visit_id JOIN players p ON p.id=v.player_id
          WHERE r.status='finished' AND r.course=? AND (?='all' OR r.character=?) AND r.duration_ms>0 AND r.ruleset=?
        ), ranked AS (
          SELECT nickname,character,duration_ms durationMs,player_id=? isMe,
          RANK() OVER(ORDER BY duration_ms) rank,
          ROW_NUMBER() OVER(ORDER BY duration_ms,finished_at,run_id) position,
          COUNT(*) OVER() total FROM attempts WHERE attempt=1
        ) SELECT * FROM ranked WHERE position<=50 OR isMe=1 ORDER BY position`).all(course,character,character,CURRENT_RULESET,viewer);
        const entry=row=>({rank:row.rank,nickname:row.nickname,character:row.character,durationMs:row.durationMs,isMe:!!row.isMe});
        const personal=rows.find(row=>row.isMe);
        return send(res,200,{course,character,entries:rows.filter(row=>row.position<=50).map(entry),personalBest:personal?entry(personal):null,total:rows[0]?.total??0});
      }
      if(pathname==='/api/play/visit'&&req.method==='POST'){
        const data=await readJson(req),time=now();let token=cookie(req,'gs_player'),id=/^[A-Za-z0-9_-]{43}$/.test(token)?sha(token):'';
        let player=id?db.prepare('SELECT * FROM players WHERE id=?').get(id):null;
        const requested=cleanNickname(data.nickname);
        if(!player){token=randomBytes(32).toString('base64url');id=sha(token);const nickname=requested||`旅人-${id.slice(0,4).toUpperCase()}`;db.prepare('INSERT INTO players VALUES(?,?,?,?)').run(id,nickname,time,time);player={id,nickname};setCookie(res,'gs_player',token,365*86400);}
        else if(requested){db.prepare('UPDATE players SET nickname=?,last_seen=? WHERE id=?').run(requested,time,id);player.nickname=requested;}
        const visitId=randomUUID();db.prepare('INSERT INTO visits(id,player_id,opened_at,seen_at,device) VALUES(?,?,?,?,?)').run(visitId,id,time,time,deviceName(String(req.headers['user-agent']??'')));db.prepare('UPDATE players SET last_seen=? WHERE id=?').run(time,id);
        return send(res,201,{visitId,nickname:player.nickname,playerId:id.slice(0,8)});
      }
      if(pathname==='/api/play/nickname'&&req.method==='POST'){const data=await readJson(req),id=playerId(req),nickname=cleanNickname(data.nickname);requireValue(nickname.length>0,'请输入昵称');db.prepare('UPDATE players SET nickname=? WHERE id=?').run(nickname,id);return send(res,200,{nickname});}
      if(pathname==='/api/play/start'&&req.method==='POST'){
        const data=await readJson(req),player=visit(req,data.visitId);requireValue(UUID.test(data.runId??'')&&characters.has(data.character)&&Number.isInteger(data.course)&&data.course>=0&&data.course<=2);
        const ruleset=data.ruleset??'legacy';requireValue(ACCEPTED_RULESETS.includes(ruleset),'请选择有效的速度规则');
        const existing=db.prepare('SELECT visit_id,character,course,ruleset FROM runs WHERE id=?').get(data.runId);
        if(existing&&(existing.visit_id!==data.visitId||existing.character!==data.character||existing.course!==data.course||existing.ruleset!==ruleset))throw new HttpError(409,'记录编号已使用');
        db.prepare('INSERT OR IGNORE INTO runs(id,visit_id,character,course,started_at,updated_at,ruleset) VALUES(?,?,?,?,?,?,?)').run(data.runId,data.visitId,data.character,data.course,now(),now(),ruleset);touch(data.visitId,player);return send(res,200,{ok:true});
      }
      if(pathname==='/api/play/heartbeat'&&req.method==='POST'){
        const data=await readJson(req),player=visit(req,data.visitId);touch(data.visitId,player,data.visible!==false);
        if(data.runId&&UUID.test(data.runId)&&Number.isFinite(data.progress))db.prepare("UPDATE runs SET updated_at=?,progress=MAX(progress,?) WHERE id=? AND visit_id=? AND status='started'").run(now(),Math.max(0,Math.min(.999,data.progress)),data.runId,data.visitId);
        return send(res,200,{ok:true});
      }
      if((pathname==='/api/play/finish'||pathname==='/api/play/abandon')&&req.method==='POST'){
        const data=await readJson(req),player=visit(req,data.visitId);requireValue(UUID.test(data.runId??''));
        const run=db.prepare('SELECT * FROM runs WHERE id=? AND visit_id=?').get(data.runId,data.visitId);if(!run)throw new HttpError(404,'本场记录不存在');
        if(pathname.endsWith('/finish')){
          requireValue(Number.isInteger(data.durationMs)&&data.durationMs>=1000&&data.durationMs<=3600000);
          requireValue(['tokens','sonicMs','bumps'].every(k=>Number.isInteger(data[k])&&data[k]>=0));requireValue(data.tokens<=10000&&data.sonicMs<=data.durationMs+1000&&data.bumps<=10000);
          // Results are client reports; the casual leaderboard is not anti-cheat verified.
          if(run.status!=='finished')db.prepare("UPDATE runs SET status='finished',finished_at=?,updated_at=?,duration_ms=?,tokens=?,sonic_ms=?,bumps=?,progress=1 WHERE id=?").run(now(),now(),data.durationMs,data.tokens,data.sonicMs,data.bumps,data.runId);
        }else db.prepare("UPDATE runs SET status='abandoned',updated_at=? WHERE id=? AND status='started'").run(now(),data.runId);
        touch(data.visitId,player);return send(res,200,{ok:true});
      }
      if(pathname==='/api/admin/login'&&req.method==='POST'){
        const data=await readJson(req);requireValue(typeof data.password==='string'&&data.password.length<=256);
        if(!checkPassword(data.password,adminPasswordHash))throw new HttpError(401,'管理密码不正确');
        const token=randomBytes(32).toString('base64url');db.prepare('DELETE FROM admin_sessions WHERE expires_at<?').run(now());db.prepare('INSERT INTO admin_sessions VALUES(?,?)').run(sha(token),now()+8*3600000);setCookie(res,'gs_admin',token,8*3600,'Strict');return send(res,200,{ok:true});
      }
      if(pathname==='/api/admin/logout'&&req.method==='POST'){admin(req);db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(sha(cookie(req,'gs_admin')));setCookie(res,'gs_admin','',0,'Strict');return send(res,200,{ok:true});}
      if(pathname==='/api/admin/records'&&req.method==='GET'){
        admin(req);const {pattern}=queryFilter(url),page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get('page')??'1',10)||1)),limit=30;
        const summary=db.prepare(`SELECT (SELECT COUNT(*) FROM players) players,(SELECT COUNT(*) FROM visits) visits,(SELECT COUNT(*) FROM runs) starts,(SELECT COUNT(*) FROM runs WHERE status='finished') finishes,(SELECT COUNT(DISTINCT player_id) FROM visits WHERE visible=1 AND seen_at>?) online`).get(now()-80000);
        const total=db.prepare("SELECT COUNT(*) total FROM players WHERE nickname LIKE ? ESCAPE '!' OR id LIKE ? ESCAPE '!'").get(pattern,pattern).total;
        const recentRuns=db.prepare(`SELECT r.*,p.nickname,substr(p.id,1,8) player_code,v.device FROM runs r JOIN visits v ON v.id=r.visit_id JOIN players p ON p.id=v.player_id WHERE p.nickname LIKE ? ESCAPE '!' OR p.id LIKE ? ESCAPE '!' ORDER BY r.started_at DESC LIMIT 60`).all(pattern,pattern);
        return send(res,200,{summary,players:playerRows(pattern,limit,(page-1)*limit),recentRuns,total,page,pageSize:limit,serverTime:now()});
      }
      if(pathname==='/api/admin/export.csv'&&req.method==='GET'){
        admin(req);const {pattern}=queryFilter(url),rows=playerRows(pattern,10000,0),names={hermes:'赫尔墨斯',nezha:'哪吒',djinn:'灯神'},courses=['神使坡道','风火廊桥','灯廊捷径'];
        const values=[['昵称','浏览器编号','首次到访','最近到访','访问次数','开跑场次','完赛场次','最佳秒数','最佳赛道','最近角色','最近赛道','设备'],...rows.map(p=>[p.nickname,p.id.slice(0,8),new Date(p.first_seen).toISOString(),new Date(p.last_seen).toISOString(),p.visits,p.starts,p.finishes,p.best_ms?p.best_ms/1000:'',p.best_course===null?'':courses[p.best_course],names[p.last_character]??'',p.last_course===null?'':courses[p.last_course],p.device])];
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="godspeed-players.csv"'});return res.end('\uFEFF'+values.map(row=>row.map(csvCell).join(',')).join('\r\n'));
      }
      throw new HttpError(404,'接口不存在');
    }
    if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'不支持的请求方式');
    let decoded;try{decoded=decodeURIComponent(pathname);}catch{throw new HttpError(400,'路径不正确');}
    if(decoded.includes('\0')||decoded.includes('\\')||decoded.split('/').some(part=>part.startsWith('.')))throw new HttpError(404,'页面不存在');
    let file=path.resolve(staticRoot,'.'+decoded);if(file!==staticRoot&&!file.startsWith(staticRoot+path.sep))throw new HttpError(404,'页面不存在');
    const candidates=decoded==='/'?[path.join(staticRoot,'index.html')]:[file,path.join(file,'index.html'),file.replace(/[\/]$/,'')+'.html'];
    file=candidates.find(p=>{try{return fs.statSync(p).isFile();}catch{return false;}});if(!file)throw new HttpError(404,'页面不存在');
    const ext=path.extname(file),types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.ogg':'audio/ogg','.mp3':'audio/mpeg','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
    res.setHeader('Content-Type',types[ext]??'application/octet-stream');res.setHeader('Content-Length',fs.statSync(file).size);res.setHeader('Cache-Control',ext==='.html'?'no-cache':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=3600');
    if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
  }
  const server=http.createServer((req,res)=>{route(req,res).catch(error=>{if(res.headersSent||res.destroyed)return res.destroy();const status=error instanceof HttpError?error.status:500;if(status===500)console.error('Godspeed request failed:',error.code??error.name);send(res,status,{error:status===500?'记录暂时不可用，请稍后重试':error.message});});});
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  return {server,close:()=>new Promise(resolve=>{server.close(()=>{db.close();resolve();});server.closeIdleConnections();})};
}
