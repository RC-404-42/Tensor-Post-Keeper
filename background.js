importScripts('core.js');const C=TPKCore;let serial=Promise.resolve();
function locked(fn){const p=serial.then(fn,fn);serial=p.catch(()=>{});return p;}
const get=async key=>(await chrome.storage.session.get(key))[key];
function workspaceSender(sender,w){try{return sender.id===chrome.runtime.id&&sender.url.startsWith(chrome.runtime.getURL('workspace.html'))&&new URL(sender.url).searchParams.get('sid')===w?.sid;}catch{return false;}}
async function saveWorkspace(w){const all=await get('workspaces')||{};all[w.sid]=w;const active=await get('workspace'),update={workspaces:all};if(!active?.running||active.sid===w.sid)update.workspace=w;await chrome.storage.session.set(update);}
async function writer(op,values={}){const w=await get('workspace');if(!w)throw Error('請先開啟拾圖工作台。');let r;try{r=await chrome.runtime.sendMessage({target:'tpk-writer',workspaceId:w.sid,op,...values});}catch{}if(!r?.ok)throw Error(r?.error||'存檔工作台已關閉，請重新開啟並選擇資料夾。');return r;}
async function ready(){const r=await writer('state');if(!r.ready||r.permission!=='granted')throw Error('請先在工作台選擇存檔資料夾並允許寫入。');}
async function release(p){if(p?.buffered)await writer('release',{token:p.token}).catch(()=>{});}
function originalName(raw,p,url=''){if(raw)return String(raw).split(/[\\/]/).pop();try{const n=decodeURIComponent(new URL(url).pathname.split('/').pop());if(/\.(png|jpe?g|webp|gif|avif|bmp|tiff?)$/i.test(n))return n;}catch{}return p.image+'.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'}[p.mime]||'bin');}
async function complete(p,name){const r=await writer('finish',{token:p.token,post:p.post,batch:p.batch,image:p.image,index:p.index,filename:originalName(name,p)});p.result={state:'complete',...r.record};p.phase='complete';p.buffered=false;await chrome.storage.session.set({pending:p});return {};}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 if(m?.target==='tpk-writer')return;
 locked(async()=>{
  let w=await get('workspace');try{if(sender.id===chrome.runtime.id&&new URL(sender.url).pathname==='/workspace.html'){const sid=new URL(sender.url).searchParams.get('sid');w=(await get('workspaces'))?.[sid]||(w?.sid===sid?w:null);}}catch{}const fromWorkspace=workspaceSender(sender,w);let fromSite=false;try{fromSite=!!sender.tab&&C.site(new URL(sender.url).hostname);}catch{}
  if(m.type==='open-workspace'&&fromSite){
   if(w?.running)throw Error('已有工作台正在掃描或下載，請先停止目前工作。');
   const pending=await get('pending');if(pending&&pending.phase!=='complete')throw Error('已有圖片正在處理，請先完成或停止目前批次。');
   const sid=crypto.randomUUID(),url=new URL(m.sourceURL||sender.url);if(url.origin!==new URL(sender.url).origin)throw Error('來源網址與網站分頁不符，請重新整理來源頁。');
   const source=C.source(url.href,m.mode||'auto');
   const value={sid,sourceTabId:sender.tab.id,...source,createdAt:Date.now()};
   const tab=await chrome.tabs.create({url:chrome.runtime.getURL('workspace.html')+'?sid='+sid,active:true});value.tabId=tab.id;await saveWorkspace(value);return {};
  }
  if(m.type==='workspace-init'&&fromWorkspace)return {workspace:w};
  if(m.type==='workspace-source'&&fromWorkspace){
   if(w.running)throw Error('請先停止目前工作，再重新連接來源。');
   let d;try{d=await chrome.tabs.sendMessage(w.sourceTabId,{type:'describe'});}catch{throw Error('無法連接原本的來源分頁；請重新整理網站，再按「重新連接來源」。若已關閉，請從網站重新開啟工作台。');}
   if(!d?.ok)throw Error(d?.error||'來源分頁沒有回應。');
   if(d.version!=='1.3.1')throw Error('來源頁不是 1.3.1；請重新載入擴充功能並重新整理網站。');
   const mode=d.profile&&!d.gallery?'author':w.mode,source=C.source(d.url,mode);
   if(source.mode==='author'&&d.profile?.id!==source.author)throw Error('作者來源未就緒，請先在來源分頁開啟作者個人頁。');
   if(source.mode==='post'&&!d.gallery)throw Error('找不到貼文輪播與原生下載按鈕；請先在來源分頁打開貼文圖片，再重新連接來源。');
   Object.assign(w,source);await saveWorkspace(w);return {workspace:w,description:d};
  }
  if(m.type==='workspace-busy'&&fromWorkspace){const active=await get('workspace');if(m.busy&&active?.running&&active.sid!==w.sid)throw Error('另一個工作台正在執行，請先停止該工作；目前清單仍保留。');w.running=!!m.busy;if(!w.running)w.processingTabId=null;await saveWorkspace(w);return {};}
  if(m.type==='workspace-processing'&&fromWorkspace){if(!w.running||!Number.isSafeInteger(m.tabId))throw Error('處理分頁不正確。');w.processingTabId=m.tabId;await saveWorkspace(w);return {};}
  if(['workspace-init','workspace-source','workspace-busy','workspace-processing'].includes(m.type))throw Error('工作台已失效或已由新分頁接管，請重新從網站開啟工作台。');
  if(!fromSite)throw Error('不支援的訊息來源。');
  if(m.type==='existing'){await ready();if(!w?.running||w.processingTabId!==sender.tab.id)throw Error('這個來源不屬於目前工作台的下載工作。');return writer('existing',{post:C.safePart(m.post),batch:m.batch?C.safePart(m.batch):'',image:String(m.image)});}
  if(m.type==='arm'){
   await ready();if(!w?.running||w.processingTabId!==sender.tab.id)throw Error('這個來源不屬於目前工作台的下載工作。');const p=await get('pending');if(p&&p.phase!=='complete'&&Date.now()-p.at<90000)throw Error('另一張圖片仍在處理中。');if(p)await release(p);
   const value={tabId:sender.tab.id,token:crypto.randomUUID(),at:Date.now(),post:C.safePart(m.post),batch:m.batch?C.safePart(m.batch):'',image:String(m.image),index:Number(m.index),phase:'armed'};
   if(!/^\d+$/.test(value.image)||!Number.isSafeInteger(value.index)||value.index<0)throw Error('圖片資料不正確。');await chrome.storage.session.set({pending:value});return {token:value.token};
  }
  if(m.type==='image-parameters'){await ready();if(!w?.running||w.processingTabId!==sender.tab.id)throw Error('來源不屬於目前工作。');if(!m.metadata||m.metadata.imageId!==String(m.image)||JSON.stringify(m.metadata).length>2000000)throw Error('參數來源或大小不正確。');return writer('parameters',{post:C.safePart(m.post),batch:m.batch?C.safePart(m.batch):'',image:String(m.image),metadata:m.metadata});}
  if(m.type==='sidecar'){if(typeof m.text!=='string'||m.text.length>10e6)throw Error('資料檔過大。');return writer('sidecar',{post:C.safePart(m.post),batch:m.batch?C.safePart(m.batch):'',text:m.text});}
  const p=await get('pending');if(!p||p.tabId!==sender.tab.id||p.token!==m.token)throw Error('下載工作已取消或重設。');
  if(m.type==='buffer-start'){
   if(p.phase!=='armed'||!Number.isSafeInteger(m.size)||m.size<=0||m.size>512*1024*1024||!/^[a-f0-9]{64}$/.test(m.sha256))throw Error('原檔資料不正確。');
   await writer('start',{token:p.token,size:m.size,mime:m.mime,sha256:m.sha256});Object.assign(p,{phase:'buffering',buffered:true,size:m.size,mime:m.mime,sha256:m.sha256});await chrome.storage.session.set({pending:p});return {};
  }
  if(m.type==='buffer-chunk'){if(p.phase!=='buffering')throw Error('暫存狀態不正確。');return writer('chunk',{token:p.token,offset:m.offset,data:m.data});}
  if(m.type==='buffer-finish'){if(p.phase!=='buffering')throw Error('暫存狀態不正確。');return complete(p,m.filename);}
  if(m.type==='download-url'){
   if(p.phase!=='armed'||typeof m.url!=='string'||!m.url.startsWith('https:')||!C.mediaURL(m.url))throw Error('網站未提供可用的原檔網址，不會以預覽圖替代。');
   const r=await fetch(m.url,{credentials:'include',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`原檔下載失敗（${r.status}）。`);const blob=await r.blob();if(!blob.size||blob.size>512*1024*1024)throw Error('原檔大小不支援。');const b=new Uint8Array(await blob.arrayBuffer()),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
   await writer('start',{token:p.token,size:b.length,mime:blob.type,sha256});p.buffered=true;p.size=b.length;p.mime=blob.type;p.sha256=sha256;await chrome.storage.session.set({pending:p});
   for(let o=0;o<b.length;o+=262144){let s='';const a=b.subarray(o,o+262144);for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));await writer('chunk',{token:p.token,offset:o,data:btoa(s)});}
   return complete(p,originalName(m.filename,p,m.url));
  }
  if(m.type==='poll'){if(p.result){await chrome.storage.session.remove('pending');return {...p.result,filename:p.result.path};}return {state:'waiting'};}
  if(m.type==='release'){await release(p);await chrome.storage.session.remove('pending');return {};}
  throw Error('不支援的動作。');
 }).then(r=>reply({ok:true,...r}),e=>reply({ok:false,error:e.message}));return true;
});
chrome.action.onClicked.addListener(async tab=>{try{await chrome.tabs.sendMessage(tab.id,{type:'open-from-action'});}catch{}});

chrome.tabs.onRemoved.addListener(id=>{locked(async()=>{const all=await get('workspaces')||{},active=await get('workspace');for(const [sid,w] of Object.entries(all))if(w.tabId===id)delete all[sid];await chrome.storage.session.set({workspaces:all});if(active?.tabId===id){const p=await get('pending');await release(p);await chrome.storage.session.remove(['workspace','pending']);}}).catch(()=>{});});
