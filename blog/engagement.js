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
   // 管理者を名乗る操作は、認証済みのFirebase Custom Claimがある場合のみ有効。
   const adminRow=document.createElement("label");adminRow.className="be-admin-toggle";
   const adminCheck=document.createElement("input");adminCheck.type="checkbox";
   const adminCheckText=document.createElement("span");adminCheckText.textContent="管理者としてコメントする";
   adminRow.append(adminCheck,adminCheckText);
   form.insertBefore(adminRow,commentBox.closest("label")||commentBox);
   const adminPane=document.createElement("section");adminPane.className="be-admin";adminPane.hidden=true;
   const adminExplain=document.createElement("p");adminExplain.className="be-help";
   adminExplain.textContent="管理者本人だけが使用してください。管理者宛てメールに10桁の認証コードを送ります。";
   const codeButton=document.createElement("button");codeButton.type="button";codeButton.className="be-delete";
   codeButton.textContent="10桁のコードを管理者に送る";
   const adminCodeInput=document.createElement("input");adminCodeInput.type="text";
   adminCodeInput.inputMode="numeric";adminCodeInput.pattern="[0-9]{10}";
   adminCodeInput.maxLength=10;adminCodeInput.autocomplete="one-time-code";
   adminCodeInput.placeholder="10桁の認証コード";adminCodeInput.setAttribute("aria-label","10桁の認証コード");
   const verifyButton=document.createElement("button");verifyButton.type="button";verifyButton.className="be-delete";
   verifyButton.textContent="コードを確認";
   // Firebase SparkプランではFunctionsをデプロイできないため、認証操作を無効化。
   // 認証サーバーが稼働し、動作検証を終えるまでは有効にしない。
   const adminOtpAvailable=false;
   codeButton.disabled=!adminOtpAvailable;
   verifyButton.disabled=!adminOtpAvailable;
   const adminStatus=document.createElement("p");adminStatus.className="be-help";
   adminPane.append(adminExplain,codeButton,adminCodeInput,verifyButton,adminStatus);
   adminRow.after(adminPane);
   const endpointError=e=>(e?.code==="functions/not-found"||e?.code==="functions/internal")
     ?"認証サーバーがまだ利用できません。管理者用バックエンドの設定が必要です。"
     :"認証処理に失敗しました ["+(e?.code||"unknown")+"]";
   adminCheck.onchange=()=>{
     adminPane.hidden=!adminCheck.checked||isAdmin;
     adminStatus.textContent=adminCheck.checked
       ?(isAdmin?"管理者認証済みです。":adminOtpAvailable?"コードを発行して認証すると、管理者として投稿できます。":"管理者コード機能は準備中です。現在の無料プランではメール送信・認証サーバーが利用できません。通常コメントを送る場合はチェックを外してください。"):"";
   };
   codeButton.onclick=async()=>{
     if(!adminOtpAvailable)return;
     if(!user){adminStatus.textContent="匿名認証が完了していません。";return;}
     codeButton.disabled=true;
     try{
       const {getFunctions,httpsCallable}=await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js");
       await httpsCallable(getFunctions(app,"asia-northeast1"),"requestKoppyAdminCode")({});
       adminStatus.textContent="管理者に10桁のコードを送りました。メールを確認してください（有効期限10分）。";
     }catch(e){adminStatus.textContent=endpointError(e);}
     finally{codeButton.disabled=false;}
   };
   verifyButton.onclick=async()=>{
     if(!adminOtpAvailable)return;
     if(!user){adminStatus.textContent="匿名認証が完了していません。";return;}
     if(!/^[0-9]{10}$/.test(adminCodeInput.value)){adminStatus.textContent="10桁の数字を入力してください。";return;}
     verifyButton.disabled=true;
     try{
       const {getFunctions,httpsCallable}=await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js");
       await httpsCallable(getFunctions(app,"asia-northeast1"),"verifyKoppyAdmin")({code:adminCodeInput.value});
       await user.getIdToken(true);
       isAdmin=(await user.getIdTokenResult(true)).claims.koppyAdmin===true;
       adminCodeInput.value="";
       adminPane.hidden=isAdmin;
       adminStatus.textContent=isAdmin?"管理者として認証されました。":"認証状態を確認できませんでした。";
       showAuth();renderComments(cachedComments);
     }catch(e){adminStatus.textContent=endpointError(e);}
     finally{verifyButton.disabled=false;}
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
     set("[data-login-note]",isAdmin?"管理者認証済みです。チェックを入れたときだけ管理者として投稿します。":"ログイン不要。名前が空欄なら匿名で投稿できます。");
     adminPane.hidden=!adminCheck.checked||isAdmin;
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
    user=next;uidDisplay.textContent=user?"Firebase UID："+user.uid:"Firebase UID：認証準備中";isAdmin=false;
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
     if(adminCheck.checked&&!isAdmin){statusText("管理者コード機能は現在準備中です。通常コメントの場合は「管理者としてコメントする」のチェックを外してください。",true);return;}
     if(!content||content.length>500||name.length>30){statusText("コメントは1〜500文字、名前は30文字以内にしてください。",true);return;}
     post.disabled=true;
     try{
       // adminフラグは閲覧者のコード入力で決めない。Firebaseの検証済みclaimのみ。
       await addDoc(comments,{uid:user.uid,name,text:content,parentId:replyTo||null,admin:adminCheck.checked&&isAdmin,createdAt:serverTimestamp()});
       commentBox.value="";replyTo=null;replyNote.hidden=true;statusText("コメントを投稿しました。");
     }catch(e){
       const code=e?.code||"unknown";
       const messages={
         "permission-denied":"投稿がFirestoreルールで拒否されました。Firebase Consoleの「Firestore Database → ルール」で最新版のルールを公開してください。",
         "unauthenticated":"匿名認証が完了していません。Firebase Authenticationで匿名ログインを有効にしてください。",
         "unavailable":"通信できませんでした。ネットワークを確認して再試行してください。",
         "resource-exhausted":"利用上限に達した可能性があります。Firebaseの使用量を確認してください。",
         "failed-precondition":"Firestoreの設定またはインデックスを確認してください。"
       };
       statusText("コメントを送信できませんでした ["+code+"] "+(messages[code]||"ブラウザのConsoleに詳細を記録しました。"),true);
       console.error("Koppy blog comment submit",e);
     }
     finally{post.disabled=false;}
   };
   statusText("記事へのリアクションをお待ちしています。");
  }catch(e){statusText("記事のリアクション機能を読み込めませんでした。",true);}
 }
}
