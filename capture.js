/* Isolated-world bridge. No account tokens, image conversion, or browser settings. */
(()=>{'use strict';
 let port,ready;const waiters=new Map();
 async function connect(){
  if(ready)return ready;
  ready=new Promise((resolve,reject)=>{
   const channel=new MessageChannel();port=channel.port1;
   const timer=setTimeout(()=>reject(Error('下載接手程式尚未啟動，更新擴充功能後請重新整理網站。')),5000);
   port.onmessage=e=>{const m=e.data;if(m?.type==='ready'){clearTimeout(timer);resolve();return;}const task=waiters.get(m?.token);if(!task)return;
    if(m.type==='armed'){if(m.error)task.reject(Error(m.error));else{try{task.armed();}catch(e){task.reject(e);}}}
    if(m.type==='file'){if(m.error)task.reject(Error(m.error));else task.resolve(m);}
   };port.start();window.postMessage({type:'TPK_CONNECT_V122'},location.origin,[channel.port2]);
  });return ready;
 }
 async function capture(token,button,shouldStop){
  await connect();
  return new Promise((resolve,reject)=>{
   const started=Date.now();
   const cleanup=()=>{clearInterval(timer);waiters.delete(token);};
   const timer=setInterval(()=>{if(shouldStop()||Date.now()-started>60000){port.postMessage({type:'cancel',token});cleanup();reject(Error(shouldStop()?'已停止':'網站尚未提供下載檔案，請稍候或重新整理後再試。'));}},200);
   waiters.set(token,{armed:()=>button.click(),resolve:m=>{cleanup();resolve(m);},reject:e=>{cleanup();reject(e);}});
   port.postMessage({type:'arm',token});
  });
 }
 function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
 async function transfer(file,token,send,shouldStop,onProgress){
  if(file.url)return send({type:'download-url',token,url:file.url,filename:file.filename});
  if(file.blob?.size>512*1024*1024)throw Error('單張檔案超過 512 MiB 上限，已停止，不會縮圖代替。');
  if(!(file.blob instanceof Blob)||file.blob.size===0)throw Error('網站產生了空白或不支援的下載檔案。');
  const bytes=new Uint8Array(await file.blob.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  await send({type:'buffer-start',token,size:bytes.length,mime:file.blob.type,sha256:hash});
  for(let offset=0;offset<bytes.length;offset+=262144){
   if(shouldStop())throw Error('已停止');
   await send({type:'buffer-chunk',token,offset,data:base64(bytes.subarray(offset,offset+262144))});onProgress(Math.min(100,Math.round((offset+262144)/bytes.length*100)));
  }
  return send({type:'buffer-finish',token,filename:file.filename});
 }
 globalThis.TPKCapture={capture,transfer};
})();
