/*
Science Buzz V3 — Cloudflare Worker backend.

Required Worker secrets:
  GITHUB_APP_CLIENT_SECRET
  SESSION_SIGNING_SECRET

Required vars:
  GITHUB_APP_CLIENT_ID
  ALLOWED_ORIGIN

Required KV binding:
  SESSIONS

The Worker keeps GitHub access tokens server-side in KV and gives the
browser only an HttpOnly session cookie. It updates the repository with
GitHub's Contents API.
*/

const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":extra.origin||"*","Access-Control-Allow-Credentials":"true","Cache-Control":"no-store"}});

function cookie(headers,name){const raw=headers.get("Cookie")||"";const m=raw.match(new RegExp("(?:^|;\\s*)"+name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"=([^;]+)"));return m?decodeURIComponent(m[1]):null}
function rand(n=32){const a=new Uint8Array(n);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function sha(s){return crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)).then(b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""))}
async function pkceChallenge(verifier){const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)));let s="";for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode(...b.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function originOK(request,env){return request.headers.get("Origin")===env.ALLOWED_ORIGIN}
function cors(env){return {"Access-Control-Allow-Origin":env.ALLOWED_ORIGIN,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}}

async function github(path,env,token,options={}){
 const r=await fetch("https://api.github.com"+path,{...options,headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token,"X-GitHub-Api-Version":"2026-03-10","User-Agent":"Science-Buzz-V3",...(options.headers||{})}});
 const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}
 if(!r.ok)throw new Error(data.message||`GitHub API error ${r.status}`);
 return data;
}
function signingSecret(env){if(!env.SESSION_SIGNING_SECRET)throw new Error("Worker secret SESSION_SIGNING_SECRET is not configured.");return env.SESSION_SIGNING_SECRET}
async function session(env,request){const sid=cookie(request.headers,"sb_session");if(!sid)return null;const key=await sha(sid+signingSecret(env));return env.SESSIONS.get("s:"+key,{type:"json"})}
async function setSession(env,token,user){
 const sid=rand(32),key=await sha(sid+signingSecret(env));
 await env.SESSIONS.put("s:"+key,JSON.stringify({token,login:user.login,id:user.id}),{expirationTtl:Number(env.SESSION_TTL_SECONDS||3600)});
 return "sb_session="+encodeURIComponent(sid)+"; Max-Age="+(env.SESSION_TTL_SECONDS||3600)+"; Path=/; HttpOnly; Secure; SameSite=None";
}
async function clearSession(env,request){
 const sid=cookie(request.headers,"sb_session");if(sid){const key=await sha(sid+signingSecret(env));await env.SESSIONS.delete("s:"+key)}
}
async function exchangeCode(code,env,callback,codeVerifier){
 const r=await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({
   client_id:env.GITHUB_APP_CLIENT_ID,
   client_secret:env.GITHUB_APP_CLIENT_SECRET,
   code,
   redirect_uri:callback,
   code_verifier:codeVerifier
 })});
 const d=await r.json();if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||"GitHub authorization failed");return d.access_token;
}
async function content(env,s){
 try{const d=await github(`/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/content.json?ref=${encodeURIComponent(s.branch)}`,env,s.token);const text=atob(d.content.replace(/\n/g,""));return {sha:d.sha,data:JSON.parse(new TextDecoder().decode(Uint8Array.from(text,c=>c.charCodeAt(0))))}}
 catch(e){if(String(e.message).includes("Not Found"))return {sha:null,data:{site:{name:"Science Buzz"},facts:[]}};throw e}
}
function b64utf8(text){const bytes=new TextEncoder().encode(text);let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out)}

const SITE_URL="https://iharshvardhansingh.github.io/science-buzz";
const escHTML=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slugPart=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70).replace(/-$/,"");
function factSlug(f){return (slugPart(f.title)||"science-fact")+"-"+(f.date||"undated")}
function xmlEscape(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}
function decodeB64UTF8(value){const binary=atob(value.replace(/\n/g,""));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes)}
function encodeB64UTF8(value){return b64utf8(value)}
function articleHTML(f,related=[]){
 const slug=factSlug(f),url=`${SITE_URL}/facts/${slug}/`,title=f.seoTitle||f.title||"Science fact",description=f.seoDescription||f.headline||f.description||"Explore this science fact on Science Buzz.";
 const image=f.image?`${SITE_URL}/${String(f.image).replace(/^\/+/,"")}`:"";
 const date=f.date||new Date().toISOString().slice(0,10);
 const schema={"@context":"https://schema.org","@type":"Article","headline":title,"description":description,"datePublished":date,"dateModified":date,"mainEntityOfPage":url,"author":{"@type":"Organization","name":"Science Buzz"},"publisher":{"@type":"Organization","name":"Digital Guide","url":"https://www.digitalguide.co.in/"}};
 if(image)schema.image=[image];
 const relatedHTML=related.filter(x=>x.date!==f.date).slice(0,5).map(x=>`<a href="../${factSlug(x)}/">${escHTML(x.title)}</a>`).join("");
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHTML(title)} | Science Buzz</title><meta name="description" content="${escHTML(description.slice(0,160))}">
<meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Science Buzz"><meta property="og:title" content="${escHTML(title)}"><meta property="og:description" content="${escHTML(description.slice(0,200))}"><meta property="og:url" content="${url}">${image?`<meta property="og:image" content="${escHTML(image)}">`:""}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escHTML(title)}"><meta name="twitter:description" content="${escHTML(description.slice(0,200))}">${image?`<meta name="twitter:image" content="${escHTML(image)}">`:""}
<link rel="stylesheet" href="../../styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,"\\u003c")}</script></head>
<body><header class="topbar"><a class="logo" href="../../"><span>⚛</span> Science <b>Buzz</b></a><nav><a href="../../">Home</a><a href="../../#explore">Explore</a></nav></header>
<main class="article-page"><div class="article-breadcrumb"><a href="../../">Home</a> / <a href="../../category/${slugPart(f.category)||"science"}/">${escHTML(f.category||"Science")}</a> / Article</div>
<article><header class="article-header"><div class="article-meta"><span>${escHTML(f.category||"Science")}</span><time datetime="${escHTML(date)}">${escHTML(date)}</time></div><h1>${escHTML(title)}</h1><p class="article-deck">${escHTML(f.headline||"")}</p></header>
${image?`<img class="article-hero" src="../../${escHTML(String(f.image).replace(/^\/+/,""))}" alt="${escHTML(f.title)}" loading="eager">`:""}
<div class="article-body"><p>${escHTML(f.description||"")}</p></div>
${f.source?`<div class="article-source"><strong>Source:</strong> ${escHTML(f.source)}</div>`:""}
</article><section class="article-related"><h2>Explore more science</h2>${relatedHTML||'<a href="../../#explore">Browse all Science Buzz facts</a>'}</section>
<a class="article-back" href="../../">← Back to Science Buzz</a></main>
<footer><div class="footer-brand"><div class="logo"><span>⚛</span> Science <b>Buzz</b></div><p>Curiosity is where discovery begins.</p></div><div class="footer-owner"><img src="../../images/digital-guide-logo.png" alt="Digital Guide" class="owner-logo"><div class="copyright"><span>© ${new Date().getFullYear()} <strong>Digital Guide</strong>. All Rights Reserved.</span><span>Science Buzz is a product of Digital Guide.</span><a href="https://www.digitalguide.co.in" target="_blank" rel="noopener noreferrer">www.digitalguide.co.in ↗</a></div></div></footer>
</body></html>`;
}
function categoryHTML(category,items){
 const url=`${SITE_URL}/category/${slugPart(category)||"science"}/`;
 const links=items.map(f=>`<article class="item"><div class="inside"><div class="meta"><span class="tag">${escHTML(f.category||"Science")}</span><span>${escHTML(f.date||"")}</span></div><h2><a href="../../facts/${factSlug(f)}/">${escHTML(f.title)}</a></h2><p>${escHTML(f.headline||f.description||"")}</p></div></article>`).join("");
 const desc=`Explore ${category} facts, discoveries and explanations from Science Buzz.`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHTML(category)} Science Facts | Science Buzz</title><meta name="description" content="${escHTML(desc)}"><meta name="robots" content="index,follow"><link rel="canonical" href="${url}"><meta property="og:title" content="${escHTML(category)} Science Facts | Science Buzz"><meta property="og:description" content="${escHTML(desc)}"><meta property="og:url" content="${url}"><link rel="stylesheet" href="../../styles.css"></head><body><header class="topbar"><a class="logo" href="../../"><span>⚛</span> Science <b>Buzz</b></a><nav><a href="../../">Home</a><a href="../../#explore">Explore</a></nav></header><main class="article-page"><p class="eyebrow">SCIENCE BUZZ CATEGORY</p><h1>${escHTML(category)} Science Facts</h1><p class="article-deck">${escHTML(desc)}</p><div class="grid">${links}</div><a class="article-back" href="../../">← Back to Science Buzz</a></main></body></html>`;
}
async function getRepoText(owner,repo,path,branch,env,token){
 try{const d=await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,env,token);return {sha:d.sha,text:decodeB64UTF8(d.content||"")}}
 catch(e){if(String(e.message).includes("Not Found"))return {sha:null,text:null};throw e}
}
async function putRepoText(owner,repo,path,branch,text,env,token,message){
 const existing=await getRepoText(owner,repo,path,branch,env,token);
 await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,env,token,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,content:encodeB64UTF8(text),branch,sha:existing.sha||undefined})});
}
async function generateSEOFiles(owner,repo,branch,facts,indexHtml,env,token){
 const sorted=[...facts].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
 for(const f of sorted){
  await putRepoText(owner,repo,`facts/${factSlug(f)}/index.html`,branch,articleHTML(f,sorted),env,token,`Science Buzz: generate SEO page for ${f.date}`);
 }
 const categories=[...new Set(sorted.map(f=>f.category).filter(Boolean))];
 for(const cat of categories){
  const slug=slugPart(cat)||"science";
  await putRepoText(owner,repo,`category/${slug}/index.html`,branch,categoryHTML(cat,sorted.filter(f=>f.category===cat)),env,token,`Science Buzz: generate ${cat} category page`);
 }
 const urls=[`${SITE_URL}/`,...sorted.map(f=>`${SITE_URL}/facts/${factSlug(f)}/`),...categories.map(c=>`${SITE_URL}/category/${slugPart(c)||"science"}/`)];
 const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u=>`  <url><loc>${xmlEscape(u)}</loc></url>`).join("\n")}\n</urlset>\n`;
 await putRepoText(owner,repo,"sitemap.xml",branch,sitemap,env,token,"Science Buzz: update XML sitemap");
 const robots=`User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
 await putRepoText(owner,repo,"robots.txt",branch,robots,env,token,"Science Buzz: update robots.txt");
 // Deliberately do not modify index.html here. The homepage layout is maintained
 // manually; in particular, do not reinsert the removed category/latest-facts blocks.
}

function safeName(n){return n.toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").slice(-120)||"fact-image.jpg"}

export default {
 async fetch(request,env){
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(env)});
  const url=new URL(request.url);
  if(!originOK(request,env) && !url.pathname.startsWith("/auth/"))return json({error:"Origin not allowed."},403,{origin:env.ALLOWED_ORIGIN});

  try{
   if(url.pathname==="/auth/login"){
    const state=rand(24);
    const verifier=rand(48);
    const challenge=await pkceChallenge(verifier);
    const requestedReturn=url.searchParams.get("return_to")||env.ALLOWED_ORIGIN+"/admin/";
    let returnTo=env.ALLOWED_ORIGIN+"/admin/";
    try{
      const candidate=new URL(requestedReturn);
      if(candidate.origin===env.ALLOWED_ORIGIN) returnTo=candidate.toString();
    }catch{}
    await env.SESSIONS.put("state:"+state,JSON.stringify({return_to:returnTo,verifier}),{expirationTtl:600});
    const callback=url.origin+"/auth/callback";
    const githubUrl="https://github.com/login/oauth/authorize?client_id="+encodeURIComponent(env.GITHUB_APP_CLIENT_ID)+"&redirect_uri="+encodeURIComponent(callback)+"&state="+encodeURIComponent(state)+"&code_challenge="+encodeURIComponent(challenge)+"&code_challenge_method=S256";
    return Response.redirect(githubUrl,302);
   }
   if(url.pathname==="/auth/callback"){
    const code=url.searchParams.get("code"),state=url.searchParams.get("state");if(!code||!state)throw new Error("Missing OAuth code/state.");
    const st=await env.SESSIONS.get("state:"+state,{type:"json"});await env.SESSIONS.delete("state:"+state);if(!st)throw new Error("OAuth state expired.");
    const callback=url.origin+"/auth/callback";
    const token=await exchangeCode(code,env,callback,st.verifier),user=await github("/user",env,token);const set=await setSession(env,token,user);
    const target=new URL(st.return_to);return new Response(null,{status:302,headers:{"Location":target.toString(),"Set-Cookie":set}});
   }
   if(url.pathname==="/auth/logout"){await clearSession(env,request);return json({ok:true},200,{origin:env.ALLOWED_ORIGIN})}
   if(url.pathname==="/api/me"){const s=await session(env,request);return json({login:s?.login||null},200,{origin:env.ALLOWED_ORIGIN})}
   const s=await session(env,request);if(!s)return json({error:"Not signed in with GitHub."},401,{origin:env.ALLOWED_ORIGIN});

   if(url.pathname==="/api/seo/rebuild"&&request.method==="POST"){
    const b=await readJSON(request);
    for(const k of ["owner","repo","branch"])if(!b[k])return json({error:`Missing ${k}.`},400,{origin:env.ALLOWED_ORIGIN});
    if(!/^[A-Za-z0-9_.-]+$/.test(b.owner)||!/^[A-Za-z0-9_.-]+$/.test(b.repo))throw new Error("Invalid repository name.");
    const c=await content(env,{owner:b.owner,repo:b.repo,branch:b.branch,token:s.token});
    const facts=Array.isArray(c.data.facts)?c.data.facts:[];
    const indexFile=await getRepoText(b.owner,b.repo,"index.html",b.branch,env,s.token);
    await generateSEOFiles(b.owner,b.repo,b.branch,facts,null,env,s.token);
    return json({ok:true,message:`Generated SEO pages for ${facts.length} facts and refreshed category pages, sitemap.xml and robots.txt. Homepage layout was preserved.`},200,{origin:env.ALLOWED_ORIGIN});
   }
   if(url.pathname==="/api/content"){
    const c=await content(env,{owner:url.searchParams.get("owner"),repo:url.searchParams.get("repo"),branch:url.searchParams.get("branch")||"main",token:s.token});
    return json(c.data,200,{origin:env.ALLOWED_ORIGIN});
   }
   if(url.pathname==="/api/publish"&&request.method==="POST"){
    const b=await readJSON(request);for(const k of ["owner","repo","branch","date","category","title","headline","description","imageName","imageBase64"])if(!b[k])return json({error:`Missing ${k}.`},400,{origin:env.ALLOWED_ORIGIN});
    if(!/^[A-Za-z0-9_.-]+$/.test(b.owner)||!/^[A-Za-z0-9_.-]+$/.test(b.repo))throw new Error("Invalid repository name.");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date))throw new Error("Date must be in YYYY-MM-DD format.");
    if((b.imageBase64.length*0.75)>5*1024*1024)throw new Error("Image is larger than 5 MB.");
    const c=await content(env,{owner:b.owner,repo:b.repo,branch:b.branch,token:s.token});const facts=Array.isArray(c.data.facts)?c.data.facts:[];
    const imageName=safeName(b.imageName);const imagePath=`images/${b.date}-${imageName}`;
    const newFact={id:b.date,date:b.date,category:b.category,title:b.title,headline:b.headline,description:b.description,source:b.source||"Science Buzz",image:imagePath};
    if(b.seoTitle)newFact.seoTitle=String(b.seoTitle).slice(0,65);
    if(b.seoDescription)newFact.seoDescription=String(b.seoDescription).slice(0,160);
    const index=facts.findIndex(x=>x.date===b.date);if(index>=0)facts[index]=newFact;else facts.push(newFact);facts.sort((a,b)=>b.date.localeCompare(a.date));
    let imageSha=null;
    try{imageSha=(await github(`/repos/${b.owner}/${b.repo}/contents/${imagePath}?ref=${encodeURIComponent(b.branch)}`,env,s.token)).sha}catch(e){}
    await github(`/repos/${b.owner}/${b.repo}/contents/${imagePath}`,env,s.token,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`Science Buzz: image for ${b.date}`,content:b.imageBase64,branch:b.branch,sha:imageSha||undefined})});
    await github(`/repos/${b.owner}/${b.repo}/contents/content.json`,env,s.token,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`Science Buzz: publish fact ${b.date}`,content:b64utf8(JSON.stringify({...c.data,facts},null,2)),branch:b.branch,sha:c.sha||undefined})});
    const indexFile=await getRepoText(b.owner,b.repo,"index.html",b.branch,env,s.token);
    await generateSEOFiles(b.owner,b.repo,b.branch,facts,null,env,s.token);
    return json({ok:true,message:"Fact published. SEO article pages, category pages, sitemap.xml and robots.txt have also been generated."},200,{origin:env.ALLOWED_ORIGIN});
   }
   return json({error:"Not found."},404,{origin:env.ALLOWED_ORIGIN});
  }catch(e){return json({error:e.message||"Server error."},500,{origin:env.ALLOWED_ORIGIN})}
 }
}
async function readJSON(r){try{return await r.json()}catch(e){throw new Error("Invalid JSON request.")}}
