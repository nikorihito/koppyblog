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
   let user=null,liked=false,updatingLike=false;
   const likeBtn=host.querySelector("[data-like]"),post=host.querySelector("[data-post]");
   const login=host.querySelector("[data-login]"),logout=host.querySelector("[data-logout]"),commentList=host.querySelector("[data-comments]");
   const commentBox=host.querySelector("[data-comment]");
   function showAuth(){
    const google=!!user&&!user.isAnonymous;
    login.hidden=google;logout.hidden=!google;post.disabled=!google;
    set("[data-login-note]",google?"Googleアカウントでログイン中":"コメントにはGoogleログインが必要です。");
   }
   function showComment(id,data){
    const li=document.createElement("li");li.className="be-comment";
    const header=document.createElement("div");header.className="be-comment-head";
    const name=document.createElement("strong");name.textContent=data.name||"匿名";
    const date=document.createElement("small");date.textContent=data.createdAt?.toDate?.().toLocaleDateString("ja-JP")||"投稿中";
    header.append(name,date);
    const text=document.createElement("p");text.textContent=data.text||"";
    li.append(header,text);
    if(user&&data.uid===user.uid){
     const del=document.createElement("button");del.type="button";del.className="be-delete";del.textContent="削除";
     del.onclick=async()=>{if(!confirm("このコメントを削除しますか？"))return;try{await deleteDoc(doc(comments,id));}catch(e){statusText("コメントを削除できませんでした。",true);}};
     li.append(del);
    }
    return li;
   }
   function renderComments(items){commentList.replaceChildren();if(!items.length){const li=document.createElement("li");li.textContent="まだコメントはありません。";commentList.append(li);return;}items.forEach(item=>commentList.append(showComment(item.id,item.data())));}
   let cachedComments=[];
   onSnapshot(query(comments,orderBy("createdAt","desc"),limit(50)),snapshot=>{cachedComments=snapshot.docs;renderComments(cachedComments);},()=>statusText("コメントの読み込みに失敗しました。",true));
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
    user=next;showAuth();liked=false;
    renderComments(cachedComments);
    if(!user){try{await signInAnonymously(auth);}catch(e){statusText("認証に失敗しました。",true);}return;}
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
   login.onclick=async()=>{try{const provider=new GoogleAuthProvider();await signInWithPopup(auth,provider);}catch(e){statusText("Googleログインが完了しませんでした。",true);}};
   logout.onclick=async()=>{try{await signOut(auth);}catch(e){statusText("ログアウトできませんでした。",true);}};
   host.querySelector("[data-form]").onsubmit=async e=>{
    e.preventDefault();if(!user||user.isAnonymous)return;
    const content=commentBox.value.trim();if(!content||content.length>500){statusText("コメントは1〜500文字で入力してください。",true);return;}
    post.disabled=true;
    try{
     await addDoc(comments,{uid:user.uid,name:(user.displayName||"ユーザー").slice(0,60),text:content,createdAt:serverTimestamp()});
     commentBox.value="";statusText("コメントを投稿しました。");
    }catch(e){statusText("コメントの投稿に失敗しました。",true);}
    finally{post.disabled=false;}
   };
   statusText("記事へのリアクションをお待ちしています。");
  }catch(e){statusText("記事のリアクション機能を読み込めませんでした。",true);}
 }
}
