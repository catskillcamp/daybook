"use strict";
/* Wiring that belongs to no one module, then start-up. Loaded last. */
/* ---------- module tabs and styles ---------- */
/* A module that asks for a tab gets a nav button before "invoices" and an
   empty panel that its render() fills. */
MODULES.forEach(function(m){
  if(m.css){ var st=document.createElement("style"); st.textContent=m.css; document.head.appendChild(st); }
  if(!m.tab||!m.tab.key) return;
  var inv=document.querySelector('nav button[data-tab="invoices"]');
  var b=document.createElement("button");
  b.setAttribute("role","tab"); b.setAttribute("aria-selected","false");
  b.dataset.tab=m.tab.key; b.textContent=m.tab.label||m.tab.key;
  inv.parentNode.insertBefore(b,inv);
  var p=document.createElement("section");
  p.className="panel"; p.id="p-"+m.tab.key;
  document.querySelector("main").appendChild(p);
});

/* ---------- wiring ---------- */
document.querySelectorAll("nav button").forEach(function(b){
  b.addEventListener("click",function(){ showTab(b.dataset.tab) })});
function showTab(name){
  UI.tab=name;saveUI();
  document.querySelectorAll("nav button").forEach(function(x){
    x.setAttribute("aria-selected",x.dataset.tab===name?"true":"false")});
  document.querySelectorAll(".panel").forEach(function(p){p.classList.remove("on")});
  var p=$("#p-"+name); if(p)p.classList.add("on");
}

/* ---------- boot ---------- */
/* The name from config.js goes on the header and the browser tab. */
$("#appName").textContent=CONFIG.name.toLowerCase();
document.title=CONFIG.name;
/* Hide the tabs and buttons of any module switched off in config.js. */
document.querySelectorAll("[data-module]").forEach(function(n){
  if(!moduleOn(n.getAttribute("data-module"))) n.hidden=true});
(function(){var st=document.createElement("style");st.textContent=docCss();
  document.head.appendChild(st)})();
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"&&viewerState) hideViewer()});
load();
driveLoad();
tuneInputs(document);
/* a tab whose module was switched off falls back to the first one left */
(function(){
  var t=document.querySelector('nav button[data-tab="'+(UI.tab||"track")+'"]');
  if(!t||t.hidden) t=document.querySelector("nav button:not([hidden])");
  showTab(t?t.dataset.tab:"invoices");
})();
renderAll();
restoreFolder();

/* reopen whatever was on screen when the app was last left */
if(UI.sheet){
  var k=UI.sheet.kind;
  if((k==="stop"||k==="live")&&!S.active) UI.sheet=null;
  if(UI.sheet) paintSheet(); else saveUI();
}

function persist(){ saveUI(); try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){} }
document.addEventListener("visibilitychange",function(){
  if(document.hidden){ persist(); if(DRV.timer) driveSync(false); }   /* push pending changes on the way out */
  else { MODULES.forEach(function(m){if(m.onShow)m.onShow()}); driveSync(false); }
});
window.addEventListener("pagehide",persist);
window.addEventListener("blur",persist);

/* ---------- connectivity ---------- */
/* navigator.onLine reports whether the device has a network interface, not
   whether the internet is actually reachable — a captive wifi still reads
   online. Good enough to tell you whether a push will be picked up. */
/* With Google Drive connected the same spot shows the sync state, and a tap
   there syncs when the sign-in needs renewing. */
function paintNet(){
  var up=navigator.onLine!==false, n=$("#st"), t=up?"online":"offline", good=up;
  if(up&&driveOn()){
    t={synced:"synced",syncing:"syncing…",tap:"tap to sync",error:"sync failed — tap",offline:"offline"}[DRV.status]||"online";
    good=DRV.status==="synced";
  }
  n.textContent=t;
  n.classList.toggle("up",good);
  n.style.cursor=(driveOn()&&(DRV.status==="tap"||DRV.status==="error"))?"pointer":"";
}
$("#st").addEventListener("click",function(){
  if(driveOn()&&(DRV.status==="tap"||DRV.status==="error")) driveSync(true);
});
window.addEventListener("online",function(){ paintNet(); driveSync(false) });
window.addEventListener("offline",paintNet);
document.addEventListener("visibilitychange",function(){if(!document.hidden)paintNet()});
paintNet();
driveSync(false);

/* ---------- service worker ---------- */
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").then(function(reg){
    $("#swState").textContent="installed for offline use";
    reg.addEventListener("updatefound",function(){
      var w=reg.installing;
      if(w) w.addEventListener("statechange",function(){
        if(w.state==="installed"&&navigator.serviceWorker.controller)
          $("#swState").textContent="update ready — reopen the app to apply";
      });
    });
  }).catch(function(){ $("#swState").textContent="offline cache unavailable here" });
}else $("#swState").textContent="this browser has no offline support";
