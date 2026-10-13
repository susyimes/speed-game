import path from 'node:path';
import {createApp} from './app.mjs';

const port=Number(process.env.PORT??8790),host=process.env.HOST??'127.0.0.1';
const app=createApp({dbPath:path.resolve(process.env.DATA_DIR??'data','godspeed.sqlite'),staticDir:path.resolve(process.env.STATIC_DIR??'dist/client'),adminPasswordHash:process.env.ADMIN_PASSWORD_HASH,publicOrigin:process.env.PUBLIC_ORIGIN,secureCookies:process.env.COOKIE_SECURE!=='0',trustProxy:process.env.TRUST_PROXY==='1'});
app.server.listen(port,host,()=>console.log(`Godspeed records listening on ${host}:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void app.close().then(()=>process.exit(0));});
