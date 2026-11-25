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
       quoteBody, viewerButtons, ...      // optional hooks core asks for by name
     });

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
