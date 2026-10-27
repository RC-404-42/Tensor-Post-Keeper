/* File writes are scoped to one directory explicitly selected in our own tab.
 * No chrome.downloads, no image decoding, no rewriting existing image files.
 */
(()=>{'use strict';const C=TPKCore;
 const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 class DirectoryWriter{
  constructor(root){this.root=root;this.cache=new Map();}
  parts(post,batch){const parts=[];if(batch&&this.root.name!==C.safePart(batch))parts.push(C.safePart(batch));parts.push(C.safePart(post));return parts;}
  async directory(post,batch){let d=this.root;for(const name of this.parts(post,batch))d=await d.getDirectoryHandle(name,{create:true});return d;}
  async index(post,batch){const key=`${batch||''}/${post}`;if(this.cache.has(key))return this.cache.get(key);const dir=await this.directory(post,batch);let data={version:1,images:{}};
   try{const f=await dir.getFileHandle('download-index.json');data=JSON.parse(await (await f.getFile()).text());if(!data.images||typeof data.images!=='object')throw Error('invalid index');}catch(e){if(e.name!=='NotFoundError')throw Error('下載紀錄無法讀取，請選擇另一個資料夾或檢查 download-index.json。');}
   const value={dir,data};this.cache.set(key,value);return value;
  }
  async existing({post,batch,image}){const {dir,data}=await this.index(post,batch),record=data.images[image];if(!record||C.safePart(record.filename)!==record.filename)return {exists:false};
   try{const f=await (await dir.getFileHandle(record.filename)).getFile();if(f.size!==record.bytes||await digest(f)!==record.sha256)return {exists:false};return {exists:true,record};}catch(e){if(e.name==='NotFoundError')return {exists:false};throw e;}
  }
  async unique(dir,raw){const name=C.safePart(raw),match=name.match(/^(.*?)(\.[^.]+)?$/);for(let n=0;n<10000;n++){const v=n?`${match[1]} (${n})${match[2]||''}`:name;try{await dir.getFileHandle(v);}catch(e){if(e.name==='NotFoundError')return v;throw e;}}throw Error('同名檔案太多，請更換資料夾。');}
  async saveJSON(dir,name,value){const h=await dir.getFileHandle(name,{create:true}),w=await h.createWritable();try{await w.write(JSON.stringify(value,null,2));await w.close();}catch(e){await w.abort().catch(()=>{});throw e;}}
  async write({post,batch,image,index,filename,blob,sha256}){if(await this.root.queryPermission({mode:'readwrite'})!=='granted')throw Error('存檔資料夾權限已失效，請回工作台重新選擇資料夾。');
   const {dir,data}=await this.index(post,batch);const name=await this.unique(dir,`${String(index+1).padStart(3,'0')}_${C.safePart(image)}_${C.safePart(filename)}`);
   const h=await dir.getFileHandle(name,{create:true}),w=await h.createWritable();
   try{await w.write(blob);await w.close();const written=await h.getFile();if(written.size!==blob.size||await digest(written)!==sha256)throw Error('磁碟上的檔案完整性核對失敗。');}
   catch(e){await w.abort().catch(()=>{});await dir.removeEntry(name).catch(()=>{});throw e;}
   const record={id:image,filename:name,bytes:blob.size,mime:blob.type,sha256,savedAt:new Date().toISOString(),path:[...this.parts(post,batch),name].join('/')};data.images[image]=record;await this.saveJSON(dir,'download-index.json',data);return record;
  }
  async sidecar({post,batch,text}){const dir=await this.directory(post,batch);const name=await this.unique(dir,'post-info.json');const h=await dir.getFileHandle(name,{create:true}),w=await h.createWritable();try{await w.write(text);await w.close();}catch(e){await w.abort().catch(()=>{});throw e;}return {filename:name};}
 }
 globalThis.TPKDirectoryWriter=DirectoryWriter;globalThis.TPKDigest=digest;
 if(typeof module!=='undefined')module.exports={DirectoryWriter,digest};
})();
