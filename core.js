/* Tensor Post Keeper — local, native-download-only utilities. */
(function(root){
 'use strict';
 const site=h=>/^(www\.)?(tensor\.art|tensorhub\.art)$/.test(h);
 function imageId(url,base){try{const u=new URL(url,base);return site(u.hostname)&&u.pathname.match(/^\/images\/(\d+)\/?$/)?.[1]||null;}catch{return null;}}
 function mediaURL(raw){try{const u=new URL(raw);if(u.protocol==='blob:')return site(new URL(u.pathname).hostname);return u.protocol==='https:'&&(site(u.hostname)||/(^|\.)(tensorartassets\.com|tensorhubassets\.com)$/.test(u.hostname)||/^(images|image)\.tensor\.art$/.test(u.hostname));}catch{return false;}}
 function safePart(s){return String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,120)||'image';}
 function filename(original,job){let base=String(original||'').split(/[\\/]/).pop();if(!base||!base.includes('.'))base='original';return `Tensor-Post-Keeper/${safePart(job.post)}/${String(job.index+1).padStart(3,'0')}_${safePart(job.image)}_${safePart(base)}`;}
 function profile(raw){try{const u=new URL(raw),m=u.pathname.match(/^\/u\/([^/]+)(?:\/[^/]+)?\/?$/);return u.protocol==='https:'&&site(u.hostname)&&m?{id:m[1],url:u.origin+`/u/${m[1]}/posts`}:null;}catch{return null;}}
 function source(raw,mode='auto'){let u;try{u=new URL(raw);}catch{throw Error('來源網址無效，請從網站重新開啟工作台。');}if(u.protocol!=='https:'||!site(u.hostname))throw Error('來源必須是 Tensor.Art 或 Tensorhub.Art。');const p=profile(u.href);if(mode==='author'||mode==='auto'&&p){if(!p)throw Error('找不到作者來源；請在作者個人頁開啟作者工作台。');return {sourceURL:u.href,mode:'author',author:p.id};}if(!imageId(u.href))throw Error('請先開啟貼文圖片，或進入作者頁下載作者貼文。');return {sourceURL:u.href,mode:'post',author:null};}
 const api={site,imageId,mediaURL,safePart,filename,profile,source};root.TPKCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
