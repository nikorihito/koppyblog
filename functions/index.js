"use strict";
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const {initializeApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {createHmac,randomInt,timingSafeEqual}=require("node:crypto");
const nodemailer=require("nodemailer");
initializeApp();
const smtpHost=defineSecret("KOPPY_SMTP_HOST");
const smtpUser=defineSecret("KOPPY_SMTP_USER");
const smtpPass=defineSecret("KOPPY_SMTP_PASS");
const otpPepper=defineSecret("KOPPY_OTP_PEPPER");
const recipient="nikorihito@gmail.com"; // feedback / お問い合わせと同じ送信先
const globalRef=()=>getFirestore().doc("adminCodeDelivery/current");
const digest=(uid,code)=>createHmac("sha256",otpPepper.value()).update(uid+":"+code).digest("hex");
exports.requestKoppyAdminCode=onCall({region:"asia-northeast1",secrets:[smtpHost,smtpUser,smtpPass,otpPepper],maxInstances:2},async request=>{
 const uid=request.auth?.uid;
 if(!uid)throw new HttpsError("unauthenticated","認証が必要です。");
 const now=Date.now();
 const code=String(randomInt(0,10000000000)).padStart(10,"0");
 const record=globalRef();
 await getFirestore().runTransaction(async tx=>{
   const snap=await tx.get(record),old=snap.data()||{};
   if(now-(old.sentAt||0)<10*60*1000)throw new HttpsError("resource-exhausted","次のコード発行まで10分以上あけてください。");
   tx.set(record,{uid,hash:digest(uid,code),sentAt:now,expiresAt:now+10*60*1000,attempts:0,used:false,updatedAt:FieldValue.serverTimestamp()});
 });
 try{
   const transporter=nodemailer.createTransport({host:smtpHost.value(),port:465,secure:true,auth:{user:smtpUser.value(),pass:smtpPass.value()}});
   await transporter.sendMail({from:smtpUser.value(),to:recipient,subject:"【こっぴー】ブログ管理者認証コード",
      text:"管理者認証コード: "+code+"\n有効期限: 10分\n申請した覚えがなければ無視してください。"});
 }catch(e){
   // メール送信失敗時には同じ申請のコードだけを無効化。認証コードはログに出さない。
   await getFirestore().runTransaction(async tx=>{const snap=await tx.get(record);
     if(snap.exists&&snap.data().uid===uid&&snap.data().hash===digest(uid,code))tx.update(record,{used:true});});
   throw new HttpsError("unavailable","メール送信に失敗しました。管理者に連絡してください。");
 }
 return {sent:true};
});
exports.verifyKoppyAdmin=onCall({region:"asia-northeast1",secrets:[otpPepper],maxInstances:2},async request=>{
 const uid=request.auth?.uid,code=request.data?.code;
 if(!uid)throw new HttpsError("unauthenticated","認証が必要です。");
 if(typeof code!=="string"||!/^[0-9]{10}$/.test(code))throw new HttpsError("invalid-argument","10桁のコードを入力してください。");
 const record=globalRef(),now=Date.now();
 await getFirestore().runTransaction(async tx=>{
   const snap=await tx.get(record),data=snap.data();
   if(!data||data.uid!==uid||data.used||data.expiresAt<now)throw new HttpsError("permission-denied","コードが無効か期限切れです。");
   if(data.attempts>=5)throw new HttpsError("resource-exhausted","試行回数の上限です。");
   const expected=Buffer.from(data.hash,"hex"),provided=Buffer.from(digest(uid,code),"hex");
   const equal=expected.length===provided.length&&timingSafeEqual(expected,provided);
   tx.update(record,{attempts:FieldValue.increment(1),used:equal});
   if(!equal)return; // 失敗回数を確実に保存するためトランザクション内ではthrowしない
 });
 const state=await record.get();
 if(state.data()?.uid!==uid||!state.data()?.used||state.data()?.hash!==digest(uid,code))
   throw new HttpsError("permission-denied","管理者コードが違います。");
 const auth=getAuth(),user=await auth.getUser(uid);
 await auth.setCustomUserClaims(uid,{...user.customClaims,koppyAdmin:true});
 return {verified:true};
});
