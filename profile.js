(()=>{'use strict';const C=TPKCore;
 function profile(){return C.profile(location.origin+location.pathname);}
 async function step(scroll=false){const p=profile();if(!p||!location.pathname.replace(/\/$/,'').endsWith('/posts'))throw Error('請切到作者的「貼文／Posts」頁再掃描。');
  const map=new Map();for(const a of document.querySelectorAll('a[href*="/images/"]')){const id=C.imageId(a.href);if(!id||!a.querySelector('img'))continue;const u=new URL(a.href),post=u.searchParams.get('post_id');if(!post)continue;
   const key=post;let entry=map.get(key);if(!entry){entry={id:key,url:u.href,images:[]};map.set(key,entry);}if(!entry.images.includes(id))entry.images.push(id);
  }
  let expected=null;for(const a of document.querySelectorAll('a[href]')){try{const u=new URL(a.href);if(u.pathname===`/u/${p.id}/posts`){const txt=a.parentElement?.textContent||'';const m=txt.length<100&&txt.match(/\d[\d,]*/);if(m)expected=Number(m[0].replaceAll(',',''));}}catch{}}
  let el=document.scrollingElement||document.documentElement;const first=document.querySelector('a[href*="/images/"]');for(let node=first?.parentElement;node&&node!==document.body;node=node.parentElement){if(node.clientHeight>100&&node.scrollHeight>node.clientHeight+20&&['auto','scroll'].includes(getComputedStyle(node).overflowY)){el=node;break;}}const result={visibility:document.visibilityState,linkCount:document.querySelectorAll('a[href*="/images/"]').length,imageLinkCount:[...document.querySelectorAll('a[href*="/images/"]')].filter(a=>a.querySelector('img')).length,author:p.id,name:document.querySelector('h1')?.textContent?.trim()||p.id,posts:[...map.values()],expected,height:el.scrollHeight,top:el.scrollTop,viewport:el.clientHeight,atBottom:el.scrollTop+el.clientHeight>=el.scrollHeight-20};
  if(scroll){const top=scroll==='top'?0:Math.min(el.scrollHeight-el.clientHeight,el.scrollTop+Math.max(100,Math.floor(el.clientHeight*.75)));if(el===(document.scrollingElement||document.documentElement))window.scrollTo({top,behavior:'instant'});else el.scrollTo({top,behavior:'instant'});}return result;
 }
 globalThis.TPKProfile={profile,step};
})();
