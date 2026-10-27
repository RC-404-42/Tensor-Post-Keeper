/* Persist native directory handles only in this extension's IndexedDB.
 * No absolute path strings, website access, or browser setting changes.
 */
(()=>{'use strict';const database='tpk-folder-settings',key='collection-root';
 async function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onupgradeneeded=()=>r.result.createObjectStore('handles');r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);});}
 async function read(){const d=await db();try{return await new Promise((resolve,reject)=>{const t=d.transaction('handles','readonly'),r=t.objectStore('handles').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{d.close();}}
 async function remember(handle){const d=await db();try{await new Promise((resolve,reject)=>{const t=d.transaction('handles','readwrite');t.objectStore('handles').put(handle,key);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('資料夾記憶未完成。'));});}finally{d.close();}}
 async function prepare(handle){
  // A per-post index marks a leaf directory, never a collection root.
  try{await handle.getFileHandle('download-index.json');throw Error('這是單篇貼文的圖片資料夾，請選擇外層的收藏根目錄，避免再往裡套資料夾。');}catch(e){if(e.name!=='NotFoundError')throw e;}
  // Upgrade the old "selected parent + automatic Tensor-Post-Keeper" rule.
  // Reuse that child when present; selecting the child itself never adds it again.
  let root=handle,reused=false;if(handle.name!=='Tensor-Post-Keeper'){
   try{root=await handle.getDirectoryHandle('Tensor-Post-Keeper');reused=true;}catch(e){if(e.name!=='NotFoundError')throw e;}
  }
  return {handle:root,reused};
 }
 globalThis.TPKFolderStore={read,remember,prepare};
})();
