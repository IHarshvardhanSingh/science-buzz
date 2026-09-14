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
function originOK(request,env){return request.headers.get("Origin")===env.ALLOWED_ORIGIN}
function cors(env){return {"Access-Control-Allow-Origin":env.ALLOWED_ORIGIN,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}}

async function github(path,env,token,options={}){
 const r=await fetch("https://api.github.com"+path,{...options,headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token,"X-GitHub-Api-Version":"2026-03-10","User-Agent":"Science-Buzz-V3",...(options.headers||{})}});
 const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}
 if(!r.ok)throw new Error(data.message||`GitHub API error ${r.status}`);
 return data;
}
async function session(env,request){const sid=cookie(request.headers,"sb_session");if(!sid)return null;const key=await sha(sid+env.SESSION_SIGNING_SECRET);return env.SESSIONS.get("s:"+key,{type:"json"})}
async function setSession(env,token,user){
 const sid=rand(32),key=await sha(sid+env.SESSION_SIGNING_SECRET);
 await env.SESSIONS.put("s:"+key,JSON.stringify({token,login:user.login,id:user.id}),{expirationTtl:Number(env.SESSION_TTL_SECONDS||3600)});
 return "sb_session="+encodeURIComponent(sid)+"; Max-Age="+(env.SESSION_TTL_SECONDS||3600)+"; Path=/; HttpOnly; Secure; SameSite=Lax";
}
async function clearSession(env,request){
 const sid=cookie(request.headers,"sb_session");if(sid){const key=await sha(sid+env.SESSION_SIGNING_SECRET);await env.SESSIONS.delete("s:"+key)}
}
async function exchangeCode(code,env){
 const r=await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({client_id:env.GITHUB_APP_CLIENT_ID,client_secret:env.GITHUB_APP_CLIENT_SECRET,code})});
 const d=await r.json();if(!r.ok||!d.access_token)throw new Error(d.error_description||"GitHub authorization failed");return d.access_token;
}
async function content(env,s){
 try{const d=await github(`/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/content.json?ref=${encodeURIComponent(s.branch)}`,env,s.token);const text=atob(d.content.replace(/\n/g,""));return {sha:d.sha,data:JSON.parse(new TextDecoder().decode(Uint8Array.from(text,c=>c.charCodeAt(0))))}}
 catch(e){if(String(e.message).includes("Not Found"))return {sha:null,data:{site:{name:"Science Buzz"},facts:[]}};throw e}
}
function b64utf8(text){const bytes=new TextEncoder().encode(text);let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out)}
function safeName(n){return n.toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").slice(-120)||"fact-image.jpg"}

export default {
 async fetch(request,env){
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(env)});
  const url=new URL(request.url);
  if(!originOK(request,env) && !url.pathname.startsWith("/auth/"))return json({error:"Origin not allowed."},403,{origin:env.ALLOWED_ORIGIN});

  try{
   if(url.pathname==="/auth/login"){
    const state=rand(24);await env.SESSIONS.put("state:"+state,JSON.stringify({return_to:url.searchParams.get("return_to")||env.ALLOWED_ORIGIN+"/admin/"}),{expirationTtl:600});
    const callback=url.origin+"/auth/callback";
    const githubUrl="https://github.com/login/oauth/authorize?client_id="+encodeURIComponent(env.GITHUB_APP_CLIENT_ID)+"&redirect_uri="+encodeURIComponent(callback)+"&state="+encodeURIComponent(state)+"&scope=repo";
    return Response.redirect(githubUrl,302);
   }
   if(url.pathname==="/auth/callback"){
    const code=url.searchParams.get("code"),state=url.searchParams.get("state");if(!code||!state)throw new Error("Missing OAuth code/state.");
    const st=await env.SESSIONS.get("state:"+state,{type:"json"});await env.SESSIONS.delete("state:"+state);if(!st)throw new Error("OAuth state expired.");
    const token=await exchangeCode(code,env),user=await github("/user",env,token);const set=await setSession(env,token,user);
    const target=new URL(st.return_to);return new Response(null,{status:302,headers:{"Location":target.toString(),"Set-Cookie":set}});
   }
   if(url.pathname==="/auth/logout"){await clearSession(env,request);return json({ok:true},200,{origin:env.ALLOWED_ORIGIN})}
   if(url.pathname==="/api/me"){const s=await session(env,request);return json({login:s?.login||null},200,{origin:env.ALLOWED_ORIGIN})}
   const s=await session(env,request);if(!s)return json({error:"Not signed in with GitHub."},401,{origin:env.ALLOWED_ORIGIN});

   if(url.pathname==="/api/content"){
    const body=await readJSON(request), c=await content(env,{...body,token:s.token});return json(c.data,200,{origin:env.ALLOWED_ORIGIN});
   }
   if(url.pathname==="/api/publish"&&request.method==="POST"){
    const b=await readJSON(request);for(const k of ["owner","repo","branch","date","category","title","headline","description","imageName","imageBase64"])if(!b[k])return json({error:`Missing ${k}.`},400,{origin:env.ALLOWED_ORIGIN});
    if(!/^[A-Za-z0-9_.-]+$/.test(b.owner)||!/^[A-Za-z0-9_.-]+$/.test(b.repo))throw new Error("Invalid repository name.");
    if((b.imageBase64.length*0.75)>5*1024*1024)throw new Error("Image is larger than 5 MB.");
    const c=await content(env,{owner:b.owner,repo:b.repo,branch:b.branch,token:s.token});const facts=Array.isArray(c.data.facts)?c.data.facts:[];
    const imageName=safeName(b.imageName);const imagePath=`images/${b.date}-${imageName}`;
    const newFact={id:b.date,date:b.date,category:b.category,title:b.title,headline:b.headline,description:b.description,source:b.source||"Science Buzz",image:imagePath};
    const index=facts.findIndex(x=>x.date===b.date);if(index>=0)facts[index]=newFact;else facts.push(newFact);facts.sort((a,b)=>b.date.localeCompare(a.date));
    const imageBytes=Uint8Array.from(atob(b.imageBase64),c=>c.charCodeAt(0));let imageSha=null;
    try{imageSha=(await github(`/repos/${b.owner}/${b.repo}/contents/${imagePath}?ref=${encodeURIComponent(b.branch)}`,env,s.token)).sha}catch(e){}
    await github(`/repos/${b.owner}/${b.repo}/contents/${imagePath}`,env,s.token,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`Science Buzz: image for ${b.date}`,content:b.imageBase64,branch:b.branch,sha:imageSha||undefined})});
    await github(`/repos/${b.owner}/${b.repo}/contents/content.json`,env,s.token,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`Science Buzz: publish fact ${b.date}`,content:b64utf8(JSON.stringify({...c.data,facts},null,2)),branch:b.branch,sha:c.sha||undefined})});
    return json({ok:true,message:"Fact and image published to GitHub. GitHub Pages will deploy the update."},200,{origin:env.ALLOWED_ORIGIN});
   }
   return json({error:"Not found."},404,{origin:env.ALLOWED_ORIGIN});
  }catch(e){return json({error:e.message||"Server error."},500,{origin:env.ALLOWED_ORIGIN})}
 }
}
async function readJSON(r){try{return await r.json()}catch(e){throw new Error("Invalid JSON request.")}}
