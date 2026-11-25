"use strict";
/* ---------- modules ----------
   A module is a feature that can be switched on or off in config.js
   (time tracking, quotes, ...). Each one lives in modules/<id>.js, wraps
   itself in a function, and hands core what it needs through
   registerModule():

     registerModule({
       id:      "quotes",
       render:  function(){...},          // repaint its tab(s); run by renderAll()
       sheets:  {quote:sheetQuote, ...},  // sheet builders, by UI.sheet.kind
       onShow:  function(){...},          // the app came back to the foreground
       tab:     {key:"budget", label:"budget"},  // core adds a tab and an empty
                                          // panel #p-budget for render() to fill
       css:     ".budget .row{...}",      // styles for the module's own markup
       quoteBody, viewerButtons, ...      // optional hooks core asks for by name
     });

   Modules are loaded by core/load.js from the list in config.js, so adding
   one never means editing index.html or sw.js.

   Core never calls into a module directly: it goes through this file, so a
   module that is switched off is simply never asked. */
var MODULES=[];
function moduleOn(id){return (CONFIG.modules||[]).indexOf(id)>=0}
function registerModule(m){MODULES.push(m)}
/* the first module that provides a hook by this name, or null */
function hook(name){
  for(var i=0;i<MODULES.length;i++) if(typeof MODULES[i][name]==="function") return MODULES[i][name];
  return null;
}
/* A module's own saved data: S.mods[id], created on first use. It is saved,
   backed up and imported with everything else. Keep collections as objects
   keyed by id, each record with an updatedAt, so merges (and later Drive sync)
   can tell which copy is newer. Call save() after changing it. */
function modData(id){
  if(!S.mods) S.mods={};
  if(!S.mods[id]||typeof S.mods[id]!=="object") S.mods[id]={};
  return S.mods[id];
}
var CORE_SHEETS={};   /* core's own sheets, filled in by core/setup.js and core/backup.js */
function sheetBuilder(kind){
  if(CORE_SHEETS[kind]) return CORE_SHEETS[kind];
  for(var i=0;i<MODULES.length;i++){var s=MODULES[i].sheets; if(s&&s[kind]) return s[kind]}
  return null;
}
function renderAll(){
  MODULES.forEach(function(m){if(m.render)m.render()});
  renderInvoices();renderSetup();
}
