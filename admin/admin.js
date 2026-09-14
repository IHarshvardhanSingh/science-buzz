const $=id=>document.getElementById(id);
const cfgKey="scienceBuzzV3Config";
let facts=[];
function cfg(){return JSON.parse(localStorage.getItem(cfgKey)||"{}")}
function saveCfg(){localStorage.setItem(cfgKey,JSON.stringify({owner:$("owner").value.trim(),repo:$("repo").value.trim(),branch:$("branch").value.trim()||"main",worker:$("worker").value.trim().replace(/\/$/,"")}))}
function loadCfg(){const c=cfg();$("owner").value=c.owner||"";$("repo").value=c.repo||"";$("branch").value=c.branch||"main";$("worker").value=c.worker||""}
function msg(text,ok=false){$("message").textContent=text;$("message").className="message "+(ok?"ok":"error")}
function requireCfg(){const c=cfg();if(!c.owner||!c.repo||!c.worker)throw new Error("Complete the repository owner, repository name and Worker URL first.");return c}
async function api(path,options={}){const c=requireCfg();const r=await fetch(c.worker+path,{...options,credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Server request failed.");return data}
async function me(){try{const d=await api("/api/me");$("user").textContent=d.login?"Signed in as @"+d.login:"Not signed in";$("login").hidden=!!d.login;$("logout").hidden=!d.login;return !!d.login}catch(e){$("user").textContent="Not signed in";$("login").hidden=false;$("logout").hidden=true;return false}}
async function loadFacts(){try{const d=await api("/api/content");facts=d.facts||[];$("facts").innerHTML=facts.slice(0,15).map(f=>`<div class="factrow"><div><b>${esc(f.title)}</b><br><small>${esc(f.date)} • ${esc(f.category||"Science")}</small></div><small>${esc(f.image||"No image")}</small></div>`).join("")||"<p>No facts found.</p>"}catch(e){$("facts").innerHTML="<p>Sign in to load repository content.</p>"}}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
$("save-config").onclick=async()=>{saveCfg();msg("Connection settings saved. Sign in with GitHub to continue.",true);await me();loadFacts()};
$("login").onclick=()=>{saveCfg();const c=cfg();if(!c.worker){msg("Enter the Worker URL first.");return}location.href=c.worker+"/auth/login?return_to="+encodeURIComponent(location.href)};
$("logout").onclick=async()=>{try{await api("/auth/logout",{method:"POST"})}catch(e){}location.reload()};
$("refresh").onclick=loadFacts;
$("image").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{$("preview").src=r.result;$("preview-wrap").hidden=false};r.readAsDataURL(f)};
$("clear").onclick=()=>{document.querySelector("#form").reset();$("preview-wrap").hidden=true;$("date").value=new Date().toISOString().slice(0,10);$("status").textContent="Not published"};
$("form").onsubmit=async e=>{e.preventDefault();$("status").textContent="Publishing…";msg("");
 try{
  const f=$("image").files[0];if(!f)throw new Error("Please select a fact image.");
  if(f.size>5*1024*1024)throw new Error("Image must be 5 MB or smaller.");
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(",")[1]);r.onerror=reject;r.readAsDataURL(f)});
  const c=requireCfg();
  const body={owner:c.owner,repo:c.repo,branch:c.branch,date:$("date").value,category:$("category").value.trim(),title:$("title").value.trim(),headline:$("headline").value.trim(),description:$("description").value.trim(),source:$("source").value.trim(),imageName:f.name,imageBase64:data,imageType:f.type};
  const d=await api("/api/publish",{method:"POST",body:JSON.stringify(body)});
  $("status").textContent="Published ✓";msg(d.message||"Published successfully.",true);await loadFacts();
 }catch(err){$("status").textContent="Publish failed";msg(err.message||"Publish failed.")}};
$("date").value=new Date().toISOString().slice(0,10);loadCfg();me().then(loadFacts);
