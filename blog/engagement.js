import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";
import {initializeApp} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {getAuth,onAuthStateChanged,signInAnonymously,GoogleAuthProvider,signInWithPopup,signOut} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {getFirestore,doc,collection,getDoc,getDocs,runTransaction,onSnapshot,setDoc,deleteDoc,addDoc,serverTimestamp,query,orderBy,limit} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
const host=document.querySelector(".blog-engagement");
if(host){
 const status=host.querySelector("[data-status]");
 const conf=window.KOPPY_BLOG_FIREBASE_CONFIG;
 const articleId=decodeURIComponent(location.pathname.split("/").pop()||"").replace(/\.html$/,"");
 function statusText(text,error=false){status.textContent=text;status.className=error?"be-error":"be-help";}
 function set(el,text){host.querySelector(el).textContent=text;}
 if(!conf||!conf.apiKey||!conf.projectId||!conf.appId){
  statusText("閲覧数・いいね・コメントは準備中です。",true);
  host.querySelector("[data-like]").disabled=true;host.querySelector("[data-login]").hidden=true;
 }else{
  try{
   const app=initializeApp(conf);const db=getFirestore(app),auth=getAuth(app);
   const mainRef=doc(db,"blogEngagement",articleId),likes=collection(mainRef,"likes"),comments=collection(mainRef,"comments");
   let user=null,liked=false,updatingLike=false,loginInProgress=false;
   const likeBtn=host.querySelector("[data-like]"),post=host.querySelector("[data-post]");
   const login=host.querySelector("[data-login]"),logout=host.querySelector("[data-logout]"),commentList=host.querySelector("[data-comments]");
   const commentBox=host.querySelector("[data-comment]");
   let cachedComments=[],replyTo=null,isAdmin=false;
   const form=host.querySelector("[data-form]");
   const nameInput=document.createElement("input");
   nameInput.type="text";nameInput.maxLength=30;nameInput.placeholder="名前（空欄なら匿名）";nameInput.setAttribute("aria-label","投稿者名（任意）");
   const nameLabel=document.createElement("label");nameLabel.textContent="お名前（任意）";nameLabel.append(nameInput);
   const adminPane=document.createElement("details");adminPane.className="be-admin";
   const adminSummary=document.createElement("summary");adminSummary.textContent="管理者コードをメールで受け取る";
   const adminInput=document.createElement("input");adminInput.type="password";adminInput.autocomplete="off";adminInput.placeholder="管理者コード（サイトには保存しません）";
   const requestButton=document.createElement("button");requestButton.type="button";requestButton.className="be-delete";requestButton.textContent="メールに認証コードを送る";
   requestButton.onclick=async()=>{
     if(!user){statusText("匿名認証の準備中です。",true);return;}
     requestButton.disabled=true;
     try{const requestCode=httpsCallable(getFunctions(app,"asia-northeast1"),"requestKoppyAdminCode");
       await requestCode({});
       adminStatus.textContent="お問い合わせ先のメールに8桁のコードを送信しました（有効期限10分）。";
     }catch(e){adminStatus.textContent="コード発行エラー："+(e.code||"unknown");}
     finally{requestButton.disabled=false;}
   };
   const adminButton=document.createElement("button");adminButton.type="button";adminButton.className="be-delete";adminButton.textContent="管理者認証";
   const adminStatus=document.createElement("span");adminStatus.className="be-help";
   adminPane.append(adminSummary,requestButton,adminInput,adminButton,adminStatus);
   host.querySelector("[data-login-note]").after(adminPane);
   adminButton.onclick=async()=>{
     if(!user){statusText("匿名認証の準備中です。",true);return;}
     adminButton.disabled=true;
     try{
       const fn=httpsCallable(getFunctions(app,"asia-northeast1"),"verifyKoppyAdmin");
       await fn({code:adminInput.value});
       adminInput.value="";
       await user.getIdToken(true);
       isAdmin=(await user.getIdTokenResult()).claims.koppyAdmin===true;
       adminStatus.textContent=isAdmin?"管理者として認証されました。":"管理者確認が完了しませんでした。";
       renderComments(cachedComments);
     }catch(e){adminStatus.textContent="管理者認証エラー："+(e.code||"unknown");}
     finally{adminButton.disabled=false;}
   };
   form.insertBefore(nameLabel,commentBox.closest("label")||commentBox);
   const replyNote=document.createElement("p");replyNote.className="be-help";replyNote.hidden=true;
   const replyTarget=document.createElement("span");replyNote.append(replyTarget);
   const cancelReply=document.createElement("button");cancelReply.type="button";cancelReply.className="be-delete";cancelReply.textContent="返信をやめる";
   cancelReply.onclick=()=>{replyTo=null;replyNote.hidden=true;};
   replyNote.append(cancelReply);form.insertBefore(replyNote,commentBox.closest("label")||commentBox);
   function showAuth(){
     // 利用者登録なしで投稿できる（裏側ではFirebase匿名認証を使う）。
     login.hidden=true;logout.hidden=true;post.disabled=!user;
     set("[data-login-note]",isAdmin?"こっぴー（管理者）としてログイン中":"ログイン不要。名前が空欄なら匿名で投稿できます。");
   }
   function showComment(id,data,depth=0){
     const li=document.createElement("li");li.className="be-comment";
     if(depth)li.classList.add("be-reply");
     const header=document.createElement("div");header.className="be-comment-head";
     const name=document.createElement("strong");
     name.textContent=data.admin===true?"こっぴー（管理者）":(data.name||"匿名");
     const date=document.createElement("small");
     date.textContent=data.createdAt?.toDate?.().toLocaleDateString("ja-JP")||"投稿中";
     header.append(name,date);
     const body=document.createElement("p");body.textContent=data.text||"";
     li.append(header,body);
     const replyBtn=document.createElement("button");replyBtn.type="button";replyBtn.className="be-delete";replyBtn.textContent="返信";
     replyBtn.onclick=()=>{replyTo=id;replyNote.hidden=false;
       replyTarget.textContent=(data.name||"匿名")+" さんに返信中　";
       commentBox.focus();};
     li.append(replyBtn);
     if(user && (data.uid===user.uid||isAdmin)){
       const del=document.createElement("button");del.type="button";del.className="be-delete";del.textContent="削除";
       del.onclick=async()=>{if(!confirm("このコメントを削除しますか？"))return;try{await deleteDoc(doc(comments,id));}catch(e){statusText("コメントを削除できませんでした。",true);}};
       li.append(del);
     }
     return li;
   }
   function renderComments(items){
     commentList.replaceChildren();
     const data=items.map(d=>({id:d.id,value:d.data()}));
     if(!data.length){const li=document.createElement("li");li.textContent="まだコメントはありません。";commentList.append(li);return;}
     const byId=new Map(data.map(d=>[d.id,d]));
     const children=new Map();
     data.forEach(d=>{const parent=d.value.parentId||null;
       const p=parent && byId.has(parent)?parent:null;
       if(!children.has(p))children.set(p,[]);children.get(p).push(d);});
     function add(parent,container,depth,stack){
       for(const d of children.get(parent)||[]){
         if(stack.has(d.id))continue;
         const li=showComment(d.id,d.value,depth);container.append(li);
         if(depth<5){const replies=children.get(d.id)||[];
           if(replies.length){const ul=document.createElement("ul");ul.className="be-replies";li.append(ul);add(d.id,ul,depth+1,new Set([...stack,d.id]));}}
       }
     }
     add(null,commentList,0,new Set());
   }
   onSnapshot(query(comments,orderBy("createdAt","desc"),limit(100)),snapshot=>{
     cachedComments=snapshot.docs;renderComments(cachedComments);
   },e=>statusText("コメントの読み込みに失敗しました。["+e.code+"]",true));
   onSnapshot(mainRef,snapshot=>set("[data-views]",snapshot.exists()?snapshot.data().views||0:0),()=>statusText("閲覧数を取得できませんでした。",true));
   onSnapshot(likes,snapshot=>{set("[data-likes]",snapshot.size);liked=!!user&&snapshot.docs.some(d=>d.id===user.uid);likeBtn.classList.toggle("active",liked);likeBtn.setAttribute("aria-pressed",String(liked));},()=>statusText("いいねを取得できませんでした。",true));
   async function registerView(){
    const sessionKey="koppy-blog-view:"+articleId;
    try{if(sessionStorage.getItem(sessionKey))return;}catch(e){}
    await runTransaction(db,async transaction=>{
     const snap=await transaction.get(mainRef);
     if(!snap.exists())transaction.set(mainRef,{views:1});
     else transaction.update(mainRef,{views:(snap.data().views||0)+1});
    });
    try{sessionStorage.setItem(sessionKey,"1");}catch(e){}
   }
   onAuthStateChanged(auth,async next=>{
    user=next;isAdmin=false;
    if(user){try{isAdmin=(await user.getIdTokenResult()).claims.koppyAdmin===true;}catch(e){}}
    showAuth();liked=false;
    renderComments(cachedComments);
    if(!user){if(loginInProgress)return;try{await signInAnonymously(auth);}catch(e){statusText("匿名認証エラー："+(e.code||"unknown"),true);}return;}
    try{await registerView();}catch(e){statusText("閲覧数を記録できませんでした。",true);}
    try{const own=await getDoc(doc(likes,user.uid));liked=own.exists();likeBtn.classList.toggle("active",liked);likeBtn.setAttribute("aria-pressed",String(liked));}catch(e){}
    likeBtn.disabled=false;
   });
   likeBtn.onclick=async()=>{
    if(!user||updatingLike)return;updatingLike=true;likeBtn.disabled=true;
    try{const ref=doc(likes,user.uid);if(liked)await deleteDoc(ref);else await setDoc(ref,{createdAt:serverTimestamp()});liked=!liked;}
    catch(e){statusText("いいねの更新に失敗しました。",true);}
    finally{updatingLike=false;likeBtn.disabled=false;}
   };
   login.onclick=async()=>{
    if(loginInProgress)return;
    loginInProgress=true;login.disabled=true;statusText("Googleログイン画面を開いています…");
    try{
     const provider=new GoogleAuthProvider();
     await signInWithPopup(auth,provider);
     statusText("Googleログインが完了しました。");
    }catch(e){
     const code=e?.code||"unknown";
     const help={
      "auth/unauthorized-domain":"Firebase Authentication → 設定 → 承認済みドメインに nikorihito.github.io を追加してください。",
      "auth/operation-not-allowed":"Firebase Authentication → ログイン方法でGoogleを有効化してください。",
      "auth/popup-blocked":"ブラウザのポップアップを許可して再試行してください。",
      "auth/popup-closed-by-user":"ログイン画面が閉じられました。もう一度お試しください。",
      "auth/cancelled-popup-request":"別のログイン処理が進行中です。",
      "auth/network-request-failed":"通信状態を確認してください。"
     }[code]||"ブラウザの開発者ツールのConsoleで詳細を確認してください。";
     statusText("Googleログインエラー ["+code+"] "+help,true);
     console.error("Koppy blog Google login",e);
    }finally{loginInProgress=false;login.disabled=false;}
   };
   logout.onclick=async()=>{try{await signOut(auth);}catch(e){statusText("ログアウトできませんでした。",true);}};
   form.onsubmit=async e=>{
     e.preventDefault();
     if(!user){statusText("認証準備中です。しばらくして再度お試しください。",true);return;}
     const content=commentBox.value.trim(),name=nameInput.value.trim()||"匿名";
     if(!content||content.length>500||name.length>30){statusText("コメントは1〜500文字、名前は30文字以内にしてください。",true);return;}
     post.disabled=true;
     try{
       // adminフラグは閲覧者のコード入力で決めない。Firebaseの検証済みclaimのみ。
       await addDoc(comments,{uid:user.uid,name,text:content,parentId:replyTo||null,admin:isAdmin,createdAt:serverTimestamp()});
       commentBox.value="";replyTo=null;replyNote.hidden=true;statusText("コメントを投稿しました。");
     }catch(e){statusText("投稿失敗 ["+(e.code||"unknown")+"]。Firestoreルールが更新されているか確認してください。",true);}
     finally{post.disabled=false;}
   };
   statusText("記事へのリアクションをお待ちしています。");
  }catch(e){statusText("記事のリアクション機能を読み込めませんでした。",true);}
 }
}
