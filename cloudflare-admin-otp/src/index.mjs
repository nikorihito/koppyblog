// koppyblog admin OTP API — Cloudflare Workers + D1.
// Secrets: FIREBASE_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON, OTP_PEPPER.
// Never place the service account credential or OTP pepper on GitHub Pages.
const ORIGIN = "https://nikorihito.github.io";
const PROJECT = "koppyblog";
const FORM = "https://formspree.io/f/mdkzgoeb";
const TEN_MINUTES = 10 * 60 * 1000;
const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "Access-Control-Allow-Origin":ORIGIN,"Vary":"Origin","X-Content-Type-Options":"nosniff"}
});
const b64url = value => btoa(String.fromCharCode(...new Uint8Array(value)))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const enc = new TextEncoder();
function bytes(code){return enc.encode(code);}
function randomCode(){
  // Rejection sampling avoids modulo bias.
  let out="";
  while(out.length<10){
    const a=new Uint8Array(16);crypto.getRandomValues(a);
    for(const n of a){if(n<250)out+=String(n%10);if(out.length===10)break;}
  }
  return out;
}
async function digest(secret,uid,code){
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),"HMAC",false,["sign"]);
  return b64url(await crypto.subtle.sign("HMAC",key,enc.encode(uid+":"+code)));
}
function safeUid(uid){return typeof uid==="string"&&uid.length>=5&&uid.length<=128;}
async function userFromIdToken(env,idToken){
  if(typeof idToken!=="string"||idToken.length<100||idToken.length>8192)
    throw new Error("unauthenticated");
  const r=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(env.FIREBASE_API_KEY),{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken})});
  if(!r.ok)throw new Error("unauthenticated");
  const data=await r.json();
  const uid=data?.users?.[0]?.localId;
  if(!safeUid(uid))throw new Error("unauthenticated");
  return uid;
}
async function limit(db,key,now,windowMs,max){
  const r=await db.prepare(`INSERT INTO otp_rate (key,window_start,attempts)
    VALUES (?1,?2,1)
    ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN otp_rate.window_start < ?3 THEN 1 ELSE otp_rate.attempts+1 END,
    window_start=CASE WHEN otp_rate.window_start < ?3 THEN ?2 ELSE otp_rate.window_start END
    WHERE otp_rate.window_start < ?3 OR otp_rate.attempts < ?4`)
    .bind(key,now,now-windowMs,max).run();
  return r.meta?.changes===1;
}
async function issue(env,uid,ip){
  const now=Date.now();
  if(!await limit(env.DB,"global",now,86400000,30))return json({error:"request-limit"},429);
  if(!await limit(env.DB,"ip:"+ip,now,3600000,3))return json({error:"request-limit"},429);
  if(!await limit(env.DB,"uid:"+uid,now,3600000,3))return json({error:"request-limit"},429);
  const code=randomCode();
  const hash=await digest(env.OTP_PEPPER,uid,code);
  const result=await env.DB.prepare(`INSERT INTO otp_codes (uid,hash,expires_at,sent_at,attempts,consumed)
    VALUES (?1,?2,?3,?4,0,0)
    ON CONFLICT(uid) DO UPDATE SET hash=?2,expires_at=?3,sent_at=?4,attempts=0,consumed=0
    WHERE otp_codes.sent_at < ?5`)
    .bind(uid,hash,now+TEN_MINUTES,now,now-TEN_MINUTES).run();
  if(result.meta?.changes!==1)return json({error:"cooldown"},429);
  try{
    const data=new FormData();
    data.set("_subject","【こっぴー】管理者認証用10桁コード");
    data.set("message","管理者認証用コード："+code+"\n有効期限：10分\n申請UID："+uid+
      "\nこのコードを知らない人には共有しないでください。申請した覚えがない場合は無視してください。");
    const mail=await fetch(FORM,{method:"POST",headers:{Accept:"application/json"},body:data});
    if(!mail.ok)throw new Error("mail-not-delivered");
    return json({sent:true,expiresInSeconds:600});
  }catch(e){
    await env.DB.prepare("UPDATE otp_codes SET consumed=1 WHERE uid=? AND hash=?")
      .bind(uid,hash).run();
    return json({error:"delivery-failed"},503);
  }
}
async function oauthToken(env){
  const service=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if(!service.client_email||!service.private_key)throw new Error("service-account-not-configured");
  const header=b64url(enc.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
  const now=Math.floor(Date.now()/1000);
  const payload=b64url(enc.encode(JSON.stringify({
    iss:service.client_email,sub:service.client_email,
    aud:"https://oauth2.googleapis.com/token",
    scope:"https://www.googleapis.com/auth/identitytoolkit",
    iat:now,exp:now+300
  })));
  const string=header+"."+payload;
  const pem=service.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  const binary=atob(pem);const raw=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey("pkcs8",raw,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign({name:"RSASSA-PKCS1-v1_5"},key,enc.encode(string));
  const assertion=string+"."+b64url(signature);
  const token=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})
  });
  if(!token.ok)throw new Error("google-oauth-error");
  const result=await token.json();if(!result.access_token)throw new Error("google-oauth-empty");
  return result.access_token;
}
async function grantAdmin(env,uid){
  const token=await oauthToken(env);
  const url="https://identitytoolkit.googleapis.com/v1/projects/"+PROJECT+"/accounts:";
  async function call(method,data){
    const r=await fetch(url+method,{
      method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify(data)});
    if(!r.ok)throw new Error("firebase-admin-error-"+r.status);
    return await r.json();
  }
  const found=await call("lookup",{localId:[uid]});
  const entry=found?.users?.[0];
  if(entry?.localId!==uid)throw new Error("user-not-found");
  const existing=entry.customAttributes?JSON.parse(entry.customAttributes):{};
  await call("update",{localId:uid,customAttributes:JSON.stringify({...existing,koppyAdmin:true})});
}
async function verify(env,uid,code){
  if(typeof code!=="string"||!/^\d{10}$/.test(code))return json({error:"invalid-code"},400);
  const row=await env.DB.prepare("SELECT hash,expires_at,attempts,consumed FROM otp_codes WHERE uid=?").bind(uid).first();
  if(!row||row.consumed||row.expires_at<Date.now()||row.attempts>=5)
    return json({error:"expired-or-locked"},403);
  const hash=await digest(env.OTP_PEPPER,uid,code);
  // Consume the challenge atomically, allowing only one successful request.
  if(hash!==row.hash){
    await env.DB.prepare("UPDATE otp_codes SET attempts=attempts+1 WHERE uid=? AND consumed=0 AND attempts<5").bind(uid).run();
    return json({error:"invalid-code"},403);
  }
  const done=await env.DB.prepare(
    "UPDATE otp_codes SET consumed=1 WHERE uid=? AND hash=? AND consumed=0 AND attempts<5 AND expires_at>?"
  ).bind(uid,hash,Date.now()).run();
  if(done.meta?.changes!==1)return json({error:"expired-or-locked"},403);
  try{await grantAdmin(env,uid);return json({verified:true});}
  catch(e){console.error("Admin claim assignment failed",e?.message);return json({error:"admin-setup-error"},503);}
}
export default {
  async fetch(request,env){
    const origin=request.headers.get("Origin");
    if(origin!==ORIGIN)return json({error:"forbidden"},403);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":ORIGIN,
      "Access-Control-Allow-Methods":"POST, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type",
      "Access-Control-Max-Age":"600","Vary":"Origin"
    }});
    if(request.method!=="POST")return json({error:"method-not-allowed"},405);
    const path=new URL(request.url).pathname;
    if(path!=="/request"&&path!=="/verify")return json({error:"not-found"},404);
    if(!env.DB||!env.FIREBASE_API_KEY||!env.OTP_PEPPER||!env.FIREBASE_SERVICE_ACCOUNT_JSON)
      return json({error:"backend-not-configured"},503);
    let input;
    try{input=await request.json();}catch(e){return json({error:"invalid-json"},400);}
    try{
      const uid=await userFromIdToken(env,input?.idToken);
      if(path==="/request"){
        const ip=request.headers.get("CF-Connecting-IP")||"unknown";
        return await issue(env,uid,ip);
      }
      return await verify(env,uid,input?.code);
    }catch(e){
      if(e?.message==="unauthenticated")return json({error:"unauthenticated"},401);
      console.error("Admin OTP error",e?.message);
      return json({error:"internal"},500);
    }
  }
};
