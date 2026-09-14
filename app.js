async function getData(){try{const r=await fetch("content.json?v="+Date.now());if(!r.ok)throw 0;return await r.json()}catch(e){return {facts:[]}}}
const fmt=d=>new Date(d+"T00:00:00").toLocaleDateString(undefined,{day:"numeric",month:"long",year:"numeric"});
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function render(data){
 const facts=[...(data.facts||[])].sort((a,b)=>b.date.localeCompare(a.date)),today=new Date().toISOString().slice(0,10),f=facts.find(x=>x.date===today)||facts[0];
 if(!f){document.querySelector("#today-title").textContent="Your next fact is coming soon.";return}
 document.querySelector("#today-title").textContent=f.title;document.querySelector("#today-date").textContent=fmt(f.date);
 document.querySelector("#today-category").textContent=f.category||"Science";document.querySelector("#today-headline").textContent=f.headline||f.title;
 document.querySelector("#today-description").textContent=f.description||"";document.querySelector("#today-source").textContent=f.source||"Science Buzz";
 const img=document.querySelector("#today-image"),fb=document.querySelector("#image-fallback");
 if(f.image){img.src=f.image;img.alt=f.title;img.onerror=()=>{img.style.display="none";fb.style.display="grid"}}else{img.style.display="none";fb.style.display="grid"}
 const filter=document.querySelector("#filter"),cats=[...new Set(facts.map(x=>x.category).filter(Boolean))];cats.forEach(c=>filter.insertAdjacentHTML("beforeend",`<option>${safe(c)}</option>`));
 const grid=document.querySelector("#grid");function draw(cat="all"){grid.innerHTML=facts.filter(x=>cat==="all"||x.category===cat).map(x=>`<article class="item">${x.image?`<img src="${safe(x.image)}" alt="${safe(x.title)}" loading="lazy">`:""}<div class="inside"><div class="meta"><span class="tag">${safe(x.category||"Science")}</span><span>${fmt(x.date)}</span></div><h3>${safe(x.title)}</h3><p>${safe(x.description||"")}</p></div></article>`).join("")}
 filter.onchange=e=>draw(e.target.value);draw();
 document.querySelector("#share-btn").onclick=async()=>{const text=`${f.title} — Science Buzz`;if(navigator.share){await navigator.share({title:"Science Buzz",text,url:location.href})}else{try{await navigator.clipboard.writeText(location.href);alert("Science Buzz link copied!")}catch(e){alert(location.href)}}};
 document.querySelector("#year").textContent=new Date().getFullYear();
}
getData().then(render);