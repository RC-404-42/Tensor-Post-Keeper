/* Capture only the final file produced by an explicitly armed native download.
 * Runs in MAIN at document_start, before FileSaver can cache DOM methods.
 * Blob -> Blob transfer copies file bytes; it never decodes an image.
 */
(()=>{'use strict';
 let port=null,armed=null;const blobs=new Map();
 const originalCreate=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;
 const originalDispatch=HTMLAnchorElement.prototype.dispatchEvent,originalOpen=window.open;
 const mediaURL=raw=>{try{const u=new URL(raw,location.href);return u.protocol==='blob:'&&new URL(u.pathname).origin===location.origin||u.protocol==='data:'&&/^data:(image\/|application\/octet-stream)/i.test(raw)||u.protocol==='https:'&&(/^(www\.)?(tensor\.art|tensorhub\.art)$/.test(u.hostname)||/(^|\.)(tensorartassets\.com|tensorhubassets\.com)$/.test(u.hostname));}catch{return false;}};
 URL.createObjectURL=function(blob){const url=originalCreate.call(this,blob);if(armed&&blob instanceof Blob)blobs.set(url,blob);return url;};
 // Some download libraries call showSaveFilePicker directly. Those never
 // create a download anchor, so 1.1.0's anchor-only capture missed them.
 const originalPicker=window.showSaveFilePicker;
 if(typeof originalPicker==='function')window.showSaveFilePicker=async function(options={}){
  if(!armed)return originalPicker.apply(this,arguments);
  const task=armed;task.taken=true;armed=null;blobs.clear();
  const accept=options.types?.[0]?.accept||{},mime=Object.keys(accept)[0]||'application/octet-stream';
  const extension=Object.values(accept)[0]?.[0]||'';const name=options.suggestedName||('native-original'+extension);
  let blob=new Blob([],{type:mime}),position=0,closed=false;
  const write=async input=>{
   if(closed)throw Error('File stream is closed');
   let value=input;
   if(input&&typeof input==='object'&&!(input instanceof Blob)&&!ArrayBuffer.isView(input)&&!(input instanceof ArrayBuffer)&&'type' in input){
    if(input.type==='seek'){position=input.position;return;}
    if(input.type==='truncate'){const size=input.size;blob=size<=blob.size?blob.slice(0,size,mime):new Blob([blob,new Uint8Array(size-blob.size)],{type:mime});position=Math.min(position,size);return;}
    if(input.type!=='write')throw Error('Unsupported file operation');if(input.position!==undefined)position=input.position;value=input.data;
   }
   if(!Number.isSafeInteger(position)||position<0)throw Error('Invalid file position');
   const part=value instanceof Blob?value:new Blob([value]);
   const prefix=position>blob.size?new Blob([blob,new Uint8Array(position-blob.size)]):blob.slice(0,position);
   blob=new Blob([prefix,part,blob.slice(position+part.size)],{type:part.type||blob.type||mime});position+=part.size;
  };
  const close=async()=>{if(closed)return;closed=true;if(!task.cancelled)port?.postMessage({type:'file',token:task.token,blob,filename:name,method:'file-picker'});};
  const abort=async()=>{closed=true;if(!task.cancelled)port?.postMessage({type:'file',token:task.token,error:'網站取消了原始檔案寫入。'});};
  return {kind:'file',name,queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',isSameEntry:async()=>false,getFile:async()=>new File([blob],name,{type:blob.type}),createWritable:async()=>{
   const stream=new WritableStream({write,close,abort});stream.write=write;stream.close=close;stream.abort=abort;stream.seek=async p=>write({type:'seek',position:p});stream.truncate=async size=>write({type:'truncate',size});return stream;
  }};
 };
 function take(raw,filename){
  if(!armed||armed.taken||!mediaURL(raw))return false;
  const task=armed;task.taken=true;armed=null;const blob=blobs.get(raw);blobs.clear();if(task.cancelled)return true;
  (async()=>{
   if(blob){port?.postMessage({type:'file',token:task.token,blob,filename,method:'anchor'});return;}
   if(raw.startsWith('blob:')||raw.startsWith('data:')){
    const r=await fetch(raw);if(!r.ok)throw Error('無法讀取網站產生的原始檔案。');
    port?.postMessage({type:'file',token:task.token,blob:await r.blob(),filename,method:'blob-link'});
   }else port?.postMessage({type:'file',token:task.token,url:raw,filename});
  })().catch(e=>port?.postMessage({type:'file',token:task.token,error:e.message}));
  return true;
 }
 function takeAnchor(a){return !!a.href&&(a.hasAttribute('download')||a.href.startsWith('blob:')||a.href.startsWith('data:image/'))&&take(a.href,a.getAttribute('download')||'');}
 HTMLAnchorElement.prototype.click=function(...args){if(takeAnchor(this))return;return originalClick.apply(this,args);};
 HTMLAnchorElement.prototype.dispatchEvent=function(event){if(event?.type==='click'&&takeAnchor(this))return true;return originalDispatch.call(this,event);};
 document.addEventListener('click',e=>{const a=e.target?.closest?.('a');if(a&&takeAnchor(a)){e.preventDefault();e.stopImmediatePropagation();}},true);
 window.open=function(url,...args){
  if(typeof url==='string'){
   try{const u=new URL(url,location.href);const looksLikeFile=u.protocol==='blob:'||u.protocol==='data:'||/(^|\.)(tensorartassets\.com|tensorhubassets\.com)$/.test(u.hostname)||/\.(png|jpe?g|webp|gif|avif|bmp|tiff?)$/i.test(u.pathname)||/\/download(?:\/|$)/i.test(u.pathname);
    if(looksLikeFile&&take(u.href,''))return null;
   }catch{}
  }return originalOpen.call(this,url,...args);
 };
 window.addEventListener('message',e=>{
  if(e.source!==window||e.origin!==location.origin||e.data?.type!=='TPK_CONNECT_V131'||!e.ports?.[0])return;
  if(port)return;port=e.ports[0];
  port.onmessage=event=>{const m=event.data;
   if(m?.type==='arm'&&typeof m.token==='string'){
    if(armed){port.postMessage({type:'armed',token:m.token,error:'上一個網站下載仍在等待，請重新整理後重試。'});return;}
    blobs.clear();armed={token:m.token,at:Date.now(),taken:false};port.postMessage({type:'armed',token:m.token});
   }
   if(m?.type==='cancel'&&armed?.token===m.token){armed.cancelled=true;blobs.clear();}
  };port.start();port.postMessage({type:'ready'});
 });
})();
