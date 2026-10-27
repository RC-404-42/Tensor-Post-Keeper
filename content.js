(()=>{'use strict';if(globalThis.__TPK__)return;globalThis.__TPK__=true;
const C=TPKCore, VERSION='1.3.1', sleep=ms=>new Promise(r=>setTimeout(r,ms));
let running=false,stop=false,paused=false,currentJob=null,last=null,host,ui,collapsed=false;
async function send(m){const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||'擴充功能已重新載入，請重新整理此頁。');return r;}
function visible(e){return !!(e&&e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden';}
function nativeButton(){return [...document.querySelectorAll('button')].find(b=>visible(b)&&(/^(Ctrl|⌘|Command)\s*\+\s*S$/i.test(b.title)||b.querySelector('iconpark-icon[icon-id="download"]'))&&!b.closest('#tpk-root'));}
function scope(){const b=nativeButton();return b?.closest('article')||b?.closest('[role="dialog"]')|| (b?.closest('section')?.parentElement?.querySelector('aside')?b.closest('section').parentElement:null);}
function gallery(){const s=scope();if(!s)return null;const here=C.imageId(location.href);const b=nativeButton();
 // The dot row has multiple direct image links and includes the active image.
 // Never scan the document-wide image links: those include recommendations.
 const parents=[...new Set([...s.querySelectorAll('a[href*="/images/"]')].map(a=>a.parentElement))];
 const rows=parents.map(p=>({p,links:[...p.children].filter(e=>e.tagName==='A'&&C.imageId(e.href)),})).filter(r=>r.links.length&&r.links.some(a=>C.imageId(a.href)===here));
 rows.sort((a,b)=>b.links.length-a.links.length);
 let links=rows[0]?.links||[];
 // Exclude left/right arrows, which have no active link in the group.
 let items=[...new Map(links.map(a=>[C.imageId(a.href),{id:C.imageId(a.href),href:a.href}])).values()];
 if(!items.length&&here)items=[{id:here,href:location.href}];
 if(!items.length)return null;
 if(new URL(location.href).searchParams.has('model_id')&&!items.some(i=>new URL(i.href).searchParams.has('post_id')))items=items.filter(i=>i.id===here);
 if(!items.length)return null;
 const u=new URL(items[0].href),post=u.searchParams.get('post_id')||new URL(location.href).searchParams.get('post_id')||`image-${items[0].id}`;
 return {items,post,scope:s,button:b};
}
function status(t){ui.querySelector('#status').textContent=t;}
function render(){if(!ui)return;const g=gallery();ui.querySelector('#count').textContent=running?`${last?.results.filter(x=>x.state==='complete').length||0} / ${last?.items.length||0}`:g?`${g.items.length} 張圖片`:'請開啟貼文圖片';
 ui.querySelector('#start').disabled=running||!g;ui.querySelector('#retry').hidden=running||!(last&&last.results.filter(x=>x.state==='complete').length<last.items.length);
 ui.querySelector('#pause').hidden=!running;ui.querySelector('#pause').textContent=paused?'繼續':'暫停';ui.querySelector('#stop').hidden=!running;
 ui.querySelector('#sidecar').disabled=running;ui.querySelector('#body').hidden=collapsed;
 if(!running&&!last)status(g?'準備好了，整篇自動存檔，不逐張詢問。':'點進圖片，看到輪播與網站下載按鈕後即可使用。');
}
async function waitFor(fn,ms=20000){const start=Date.now();while(Date.now()-start<ms){if(stop)throw Error('已停止');const r=fn();if(r)return r;await sleep(160);}throw Error('等候頁面更新逾時，請重試。');}
function domSignature(s){return s?.querySelector('img')?.getAttribute('src')||'';}
async function go(item){
 let g=gallery();if(!g)throw Error('找不到原生下載按鈕，請確認貼文仍開啟。');
 if(C.imageId(location.href)!==item.id){
  const a=[...g.scope.querySelectorAll('a[href*="/images/"]')].find(a=>C.imageId(a.href)===item.id);
  if(!a)throw Error('輪播內容已變動，請重新開始。');const old=domSignature(g.scope);a.click();
  await waitFor(()=>{const n=gallery();return C.imageId(location.href)===item.id&&n&&domSignature(n.scope)!==old&&n;});
 }
 // Wait for Vue's DOM flush and an enabled native button, not for every pixel to load.
 await sleep(350);return waitFor(()=>{const n=gallery();return n&&C.imageId(location.href)===item.id&&!n.button.disabled&&n;});
}
async function downloadOne(job,item,index){
 if(job.skipExisting){const existing=await send({type:'existing',post:job.post,batch:job.batch,image:item.id});if(existing.exists){const pageInfo=job.sidecar?await readParameters((await go(item)).scope):null;return {id:item.id,state:'complete',skipped:true,...existing.record,pageInfo};}}
 const g=await go(item),meta=job.sidecar?await readParameters(g.scope):null;const armed=await send({type:'arm',post:job.post,batch:job.batch,image:item.id,index});currentJob=armed.token;
 try{
  status(`第 ${index+1} / ${job.items.length} 張：等候網站提供原檔…`);
  const file=await TPKCapture.capture(armed.token,g.button,()=>stop);
  if(stop)throw Error('已停止');
  status(`第 ${index+1} / ${job.items.length} 張：核對原檔…`);
  await TPKCapture.transfer(file,armed.token,send,()=>stop,percent=>status(`第 ${index+1} / ${job.items.length} 張：準備存檔 ${percent}%`));
  while(true){
   const r=await send({type:'poll',token:armed.token});
   if(r.state==='complete'){currentJob=null;return {id:item.id,state:'complete',bytes:r.bytes,filename:r.filename,mime:r.mime,sha256:r.sha256,captureMethod:file.method||'native-url',pageInfo:meta};}
   if(r.state==='interrupted')throw Error(`下載中斷：${r.error||'未知原因'}`);
   if(stop)throw Error('已停止（已開始的寫入會先完成）');
   status(`第 ${index+1} / ${job.items.length} 張：自動存檔中…`);await sleep(500);
  }
 }finally{if(currentJob===armed.token){await send({type:'release',token:armed.token}).catch(()=>{});currentJob=null;}}
}
async function readParameters(s){await sleep(700);let previous=null,value;for(let i=0;i<8;i++){value=TPKParameters.collect(s,location.href);const signature=JSON.stringify([value.fields,value.models]);if(Object.keys(value.fields).length&&signature===previous)return value;previous=signature;await sleep(300);}return value;}
async function run(retry=false,options={}){
 const g=gallery();if(!g||running)return;
 if(retry&&last&&!last.items.every(i=>g.items.some(x=>x.id===i.id))){status('目前是另一篇貼文，請先回到原貼文再重試。');return;}
 const job=retry?last:{post:g.post,items:g.items,results:[],batch:options.batch||'',sidecar:!!options.sidecar,skipExisting:options.skipExisting!==false,source:location.href,createdAt:new Date().toISOString()};
 last=job;running=true;stop=false;paused=false;const original={id:C.imageId(location.href),href:location.href};
 const startIndex=retry?job.items.findIndex(i=>job.results.find(r=>r.id===i.id)?.state!=='complete'):0;
 render();
 try{
  for(let i=Math.max(0,startIndex);i<job.items.length;i++){
   const item=job.items[i];if(job.results.some(x=>x.id===item.id&&x.state==='complete'))continue;
   while(paused&&!stop){status('已暫停；按「繼續」恢復。');await sleep(300);}if(stop)break;
   status(`第 ${i+1} / ${job.items.length} 張：準備下載…`);
   try{const r=await downloadOne(job,item,i);if(job.sidecar){try{const saved=await send({type:'image-parameters',post:job.post,batch:job.batch,image:item.id,metadata:r.pageInfo});r.parameterFiles=saved.files;r.missingFields=r.pageInfo?.missingFields||[];}catch(e){r.metadataError=e.message;}}job.results=job.results.filter(r=>r.id!==item.id);job.results.push(r);}
   catch(e){job.results=job.results.filter(r=>r.id!==item.id);job.results.push({id:item.id,state:'failed',error:e.message});status(e.message);stop=true;break;}
   render();await sleep(1000);
  }
 }catch(e){status(e.message);stop=true;}
 finally{
  if(currentJob&&!stop)await send({type:'release',token:currentJob}).catch(()=>{});
  const done=job.results.filter(r=>r.state==='complete').length;
  const isStopped=stop;stop=false;
  if(!isStopped&&original.id)await go(original).catch(()=>{});
  running=false;paused=false;render();
  if(!isStopped)status(`完成：${done} / ${job.items.length} 張，已寫入選定資料夾。`);
  else if(!job.results.some(r=>r.state==='failed'))status(`已停止：完成 ${done} / ${job.items.length} 張。`);
  if(options.sidecar&&job.results.length){
   await send({type:'sidecar',post:job.post,batch:job.batch,text:JSON.stringify({tool:'Tensor Post Keeper 1.3.1',policy:'Native file bytes are written directly to a user-selected directory, without chrome.downloads, pixel decoding or re-encoding; transferred bytes and saved file are checked by SHA-256. Existing embedded metadata is preserved as supplied by the website. This sidecar does not claim to be embedded metadata.',...job},null,2)}).catch(e=>status(`圖片處理已完成，但資料備份失敗：${e.message}`));
  }
 }
 return {post:job.post,total:job.items.length,done:job.results.filter(r=>r.state==='complete').length,results:job.results};
}
function mount(){host=document.createElement('div');host.id='tpk-root';host.dataset.tpkVersion=VERSION;host.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483600';ui=host.attachShadow({mode:'open'});
 ui.innerHTML=`<style>:host{all:initial;color-scheme:dark;font:14px/1.6 system-ui,"Microsoft JhengHei",sans-serif;color:#edf5ef}*{box-sizing:border-box}.panel{width:310px;background:#182622;border:1px solid #597568;border-radius:15px;box-shadow:0 10px 40px #0008;overflow:hidden}header{padding:12px 14px;background:#263d32;display:flex;gap:8px;align-items:center}b{flex:1}header button{padding:0 5px;border:0}button{font:inherit;border:1px solid #587463;background:#2a4335;color:inherit;border-radius:8px;padding:7px 10px;cursor:pointer}button:disabled{opacity:.4;cursor:default}#body{padding:14px}#count{font-size:22px;font-weight:700;color:#c5f7d7}#status{font-size:13px;min-height:42px;color:#d0e2d6}#start,#author{width:100%;margin-top:9px;background:#c0edcd;color:#162c1d;font-weight:700;border:0;padding:10px}.row{display:flex;gap:7px;margin-top:9px}small{display:block;color:#a8bcaf;font-size:11px;margin-top:10px}[hidden]{display:none!important}</style><section class="panel"><header><b>▧ 拾圖 <span style="font-size:11px;color:#c7ddcc">v1.3.1 · 資料夾直存</span></b><button id="fold">−</button></header><div id="body"><div id="count"></div><div id="status" role="status" aria-live="polite"></div><button id="start">整篇下載 → 開啟工作台</button><button id="author" hidden>整個作者頁 → 開啟工作台</button><div class="row"><button id="retry" hidden>重試未完成</button><button id="pause" hidden>暫停</button><button id="stop" hidden>停止</button></div><input id="sidecar" type="checkbox" hidden><small>先選一次資料夾，之後自動寫入原檔。<br>不使用逐檔另存流程，不改瀏覽器設定。</small></div></section>`;
 document.documentElement.append(host);
 const open=mode=>send({type:'open-workspace',mode,sourceURL:location.href}).catch(e=>status(e.message));
 ui.querySelector('#start').onclick=()=>open('post');ui.querySelector('#author').onclick=()=>open('author');ui.querySelector('#retry').onclick=()=>open('post');
 ui.querySelector('#stop').onclick=()=>{stop=true;status('正在停止…');};ui.querySelector('#pause').onclick=()=>{paused=!paused;render();};
 ui.querySelector('#fold').onclick=()=>{collapsed=!collapsed;ui.querySelector('#fold').textContent=collapsed?'+':'−';render();};render();
}
mount();setInterval(()=>{const g=gallery(),p=TPKProfile.profile();host.style.display=g||p||running||last?'':'none';render();ui.querySelector('#author').hidden=!p||running;
 if(!g&&p&&!running){ui.querySelector('#count').textContent='作者圖片收藏';status('開啟工作台，掃描作者的貼文並整批存檔。');}
 const roots=document.querySelectorAll('[id="tpk-root"]');if(roots.length>1){status('偵測到另一份拾圖，請移除舊版後重新整理，避免重複觸發下載。');for(const id of ['#start','#author','#retry'])ui.querySelector(id).disabled=true;}
},1000);
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 if(sender.id!==chrome.runtime.id)return;
 if(m.type==='describe'){const g=gallery(),p=TPKProfile.profile();reply({ok:true,version:VERSION,url:location.href,profile:p,gallery:g?{post:g.post,items:g.items}:null,creator:g?.scope.querySelector('a[href*="/u/"]')?.href?.match(/\/u\/([^/?]+)/)?.[1]||null});return;}
 if(m.type==='profile-step'){TPKProfile.step(m.reset?'top':m.scroll).then(r=>reply({ok:true,...r}),e=>reply({ok:false,error:e.message}));return true;}
 if(m.type==='run-post'){if(document.querySelectorAll('[id="tpk-root"]').length>1){reply({ok:false,error:'偵測到其他版本拾圖，請移除舊版後重新整理。'});return;}run(false,m.options||{}).then(r=>reply({ok:true,...r}),e=>reply({ok:false,error:e.message}));return true;}
 if(m.type==='job-control'){if(m.action==='stop')stop=true;if(m.action==='pause')paused=true;if(m.action==='resume')paused=false;reply({ok:true});return;}
 if(m.type==='open-from-action')send({type:'open-workspace',mode:TPKProfile.profile()?'author':'post',sourceURL:location.href}).catch(e=>status(e.message));
});
})();
