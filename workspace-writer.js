(()=>{'use strict';const jobs=new Map();let writer=null,serial=Promise.resolve();const workspaceId=new URL(location.href).searchParams.get('sid');
 globalThis.TPKSetDirectory=root=>{writer=new TPKDirectoryWriter(root);};
 chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m?.target!=='tpk-writer'||m.workspaceId!==workspaceId||sender.id!==chrome.runtime.id||sender.tab)return;
  const task=async()=>{
   if(m.op==='state')return {ready:!!writer,directory:writer?.root.name||'',permission:writer?await writer.root.queryPermission({mode:'readwrite'}):'prompt'};
   if(!writer)throw Error('請先在拾圖工作台選擇存檔資料夾。');
   if(m.op==='existing')return writer.existing(m);
   if(m.op==='sidecar')return writer.sidecar(m);
   if(m.op==='start'){
    if(!Number.isSafeInteger(m.size)||m.size<=0||m.size>512*1024*1024)throw Error('單張檔案超過支援範圍，已停止，不會以縮圖代替。');
    jobs.set(m.token,{size:m.size,mime:m.mime||'application/octet-stream',sha256:m.sha256,chunks:[],offset:0});return {};
   }
   const j=jobs.get(m.token);if(!j){if(m.op==='release')return {};throw Error('原檔暫存已失效。');}
   if(m.op==='chunk'){
    if(m.offset!==j.offset||typeof m.data!=='string'||m.data.length>360000)throw Error('原檔資料區塊順序不正確。');const bytes=Uint8Array.from(atob(m.data),c=>c.charCodeAt(0));if(j.offset+bytes.length>j.size)throw Error('原檔資料超出預期大小。');j.chunks.push(bytes);j.offset+=bytes.length;return {};
   }
   if(m.op==='finish'){
    if(j.offset!==j.size)throw Error('原檔資料未完整送達。');const blob=new Blob(j.chunks,{type:j.mime});if(await TPKDigest(blob)!==j.sha256){jobs.delete(m.token);throw Error('原檔完整性核對失敗，已停止存檔。');}
    const record=await writer.write({...m,blob,sha256:j.sha256});jobs.delete(m.token);if(typeof globalThis.dispatchEvent==='function')globalThis.dispatchEvent(new CustomEvent('tpk-file-saved',{detail:record}));return {record};
   }
   if(m.op==='release'){jobs.delete(m.token);return {};}
   throw Error('不支援的存檔動作。');
  };
  const p=serial.then(task,task);serial=p.catch(()=>{});p.then(r=>reply({ok:true,...r}),e=>reply({ok:false,error:e.message}));return true;
 });
})();
