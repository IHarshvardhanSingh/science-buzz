const BASE_PATH="/science-buzz/";
const $=s=>document.querySelector(s);
async function getData(){try{const r=await fetch("content.json");if(!r.ok)throw 0;return await r.json()}catch(e){return {facts:[]}}}
const fmt=d=>new Date(d+"T00:00:00").toLocaleDateString(undefined,{day:"numeric",month:"long",year:"numeric"});
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const slug=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70).replace(/-$/,"");
const articleUrl=f=>"facts/"+(slug(f.title)||"science-fact")+"-"+(f.date||"undated")+"/";
function render(data){
 const facts=[...(data.facts||[])].sort((a,b)=>b.date.localeCompare(a.date)),today=new Date().toISOString().slice(0,10),f=facts.find(x=>x.date===today)||facts[0];
 if(!f){$("#today-title").textContent="Your next fact is coming soon.";return}
 $("#today-title").textContent=f.title;$("#today-date").textContent=fmt(f.date);
 $("#today-category").textContent=f.category||"Science";$("#today-headline").textContent=f.headline||f.title;
 $("#today-description").textContent=f.description||"";$("#today-source").textContent=f.source||"Science Buzz";
 $("#today-read").href=articleUrl(f);
 const img=$("#today-image"),fb=$("#image-fallback");
 if(f.image){img.src=f.image;img.alt=f.title;img.onerror=()=>{img.style.display="none";fb.style.display="grid"}}else{img.style.display="none";fb.style.display="grid"}
 const filter=$("#filter"),cats=[...new Set(facts.map(x=>x.category).filter(Boolean))];cats.forEach(c=>filter.insertAdjacentHTML("beforeend",`<option value="${safe(c)}">${safe(c)}</option>`));
 const grid=$("#grid");
 function draw(cat="all"){grid.innerHTML=facts.filter(x=>cat==="all"||x.category===cat).map(x=>`<a class="item-link" href="${articleUrl(x)}"><article class="item">${x.image?`<img src="${safe(x.image)}" alt="${safe(x.title)}" loading="lazy">`:""}<div class="inside"><div class="meta"><span class="tag">${safe(x.category||"Science")}</span><span>${fmt(x.date)}</span></div><h3>${safe(x.title)}</h3><p>${safe(x.headline||x.description||"")}</p></div></article></a>`).join("")}
 filter.onchange=e=>draw(e.target.value);draw();
 $("#share-btn").onclick=async()=>{const text=`${f.title} — Science Buzz`,url=new URL(articleUrl(f),location.href).href;if(navigator.share){await navigator.share({title:f.title,text,url})}else{try{await navigator.clipboard.writeText(url);alert("Fact link copied!")}catch(e){alert(url)}}};
 $("#year").textContent=new Date().getFullYear();
}
getData().then(render);
