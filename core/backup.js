"use strict";
/* Backup import: merge (never un-invoices billed work) or replace. */

/* A block's id is random and assigned when the block is created, so the same
   hours arriving from a different file carry a different id. The old merge
   was a plain Object.assign by id, which happily kept both copies — that is
   how importing daybook-seed.json put a second, un-invoiced copy of an
   already-billed week into the app. Match on what the work IS (client, start,
   end), not on its id. Clients match by name for the same reason: a file
   calling them "Sawkille" must not create a second record beside
   "Sawkille Furniture". */
function clientsByName(){
  var m={}; for(var id in S.clients) m[(S.clients[id].name||"").trim().toLowerCase()]=id;
  return m;
}
/* Keyed on WHEN the work happened, deliberately not on which client it was
   billed to. A file can call the same client "Sawkille" where the app calls
   it "Sawkille Furniture" — different name, different id, same eight hours.
   You cannot be clocked in to two things at the same instant, so an exact
   start-and-end match is the same block however it is labelled. */
function blockSigs(){
  var m={};
  for(var mk in S.months) for(var bid in S.months[mk]){
    var b=S.months[mk][bid]; m[b.start+"|"+b.end]=bid;
  }
  return m;
}
/* Work out what a merge would do before anything is touched, so the sheet can
   say it plainly and so the two code paths can never drift apart. */
function planMerge(p){
  var byName=clientsByName(), remap={}, add=[], dupes=0, upd=0, stale=0, needed={};
  for(var k in (p.clients||{})){
    var nm=((p.clients[k]||{}).name||"").trim().toLowerCase(), hit=byName[nm];
    if(hit&&hit!==k) remap[k]=hit;
  }
  var sig=blockSigs();
  for(var mk in (p.months||{})) for(var bid in p.months[mk]){
    var nb=p.months[mk][bid], key=nb.start+"|"+nb.end;
    if(sig[key]&&sig[key]!==bid){ dupes++; continue }   /* same hours, other id */
    var have=(S.months[mk]||{})[bid];
    if(have){
      /* The same block, from an older copy of the store. A backup taken
         before an invoice was raised still has invoiceId empty on work that
         has since been billed, and a blind overwrite hands it back to you as
         billable. Only a strictly newer record may land. */
      if((nb.updatedAt||0)<=(have.updatedAt||0)){ stale++; continue }
      /* Belt and braces for a file with no usable updatedAt: an import may
         add an invoice link, never remove one. */
      if(have.invoiceId&&!nb.invoiceId) nb=Object.assign({},nb,{invoiceId:have.invoiceId});
      upd++;
    }
    sig[key]=bid;
    var cid=remap[nb.clientId]||nb.clientId;
    needed[cid]=1;
    add.push({mk:mk,bid:bid,rec:Object.assign({},nb,{clientId:cid})});
  }
  /* An invoice or quote coming across keeps its client alive even when every
     one of its blocks was already here. */
  for(var ik in (p.invoices||{})) needed[remap[p.invoices[ik].clientId]||p.invoices[ik].clientId]=1;
  for(var qk in (p.quotes||{}))   needed[remap[p.quotes[qk].clientId]||p.quotes[qk].clientId]=1;
  var clients=[];
  for(var k2 in (p.clients||{})) if(!remap[k2]&&needed[k2]&&!S.clients[k2]) clients.push(k2);
  return {add:add,dupes:dupes,upd:upd,stale:stale,clients:clients,remap:remap,
          names:clients.map(function(c){return (p.clients[c]||{}).name||"(unnamed)"})};
}
function importSummary(p){
  var pl=planMerge(p);
  return {clients:pl.clients.length,blocks:pl.add.length-pl.upd,
          updates:pl.upd,dupes:pl.dupes,stale:pl.stale,names:pl.names};
}
function applyBackup(p,mode){
  if(!p||typeof p!=="object")throw new Error("not a backup");
  if(mode==="replace"){
    var base=defaults();
    S.clients=p.clients||{};
    S.business=Object.assign(base.business,p.business||{});
    S.settings=Object.assign(base.settings,p.settings||{});
    S.active=p.active||null;
    S.months=p.months||{};
    S.invoices=p.invoices||{};
    S.quotes=p.quotes||{};
    S.qtemplates=p.qtemplates||{};
    S.mods=p.mods||{};
    migrate();save();return;
  }
  var pl=planMerge(p);
  pl.clients.forEach(function(k){ S.clients[k]=p.clients[k] });
  if(p.business)S.business=Object.assign(S.business,p.business);
  if(p.settings)S.settings=Object.assign(S.settings,p.settings);
  pl.add.forEach(function(a){
    S.months[a.mk]=S.months[a.mk]||{}; S.months[a.mk][a.bid]=a.rec });
  S.invoices=Object.assign(S.invoices,p.invoices||{});
  S.quotes=Object.assign(S.quotes||{},p.quotes||{});
  S.qtemplates=Object.assign(S.qtemplates||{},p.qtemplates||{});
  S.mods=mergeMods(S.mods||{},p.mods||{});
  migrate();save();
}
/* Module data merges record by record. A module keeps each collection as an
   object keyed by id, every record carrying updatedAt, and the newer copy of a
   record wins. Anything else keeps this device's value, unless it has none. */
function mergeMods(local,incoming){
  for(var id in incoming){
    var L=local[id], I=incoming[id];
    if(!L||typeof L!=="object"||!I||typeof I!=="object"){ if(L===undefined) local[id]=I; continue }
    for(var key in I){
      if(!(key in L)){ L[key]=I[key]; continue }
      var a=L[key], b=I[key];
      if(!a||!b||typeof a!=="object"||typeof b!=="object"||Array.isArray(a)||Array.isArray(b)) continue;
      for(var r in b){
        var x=a[r], y=b[r];
        if(x===undefined) a[r]=y;
        else if(x&&y&&typeof x==="object"&&typeof y==="object"&&(+y.updatedAt||0)>(+x.updatedAt||0)) a[r]=y;
      }
    }
  }
  return local;
}
function mergeBackup(p){ return applyBackup(p,"merge") }

/* Held outside UI.sheet: UI is persisted to localStorage on every change and
   a whole backup has no business going in there. A reload therefore loses the
   pending file, which is why the sheet closes if it comes back empty. */
var pendingImport=null;
function sheetImport(sh,d){
  var p=pendingImport;
  if(!p){ closeSheet(); return }
  var nb=0; for(var mk in (p.months||{})) nb+=Object.keys(p.months[mk]).length;
  var s=importSummary(p);
  head(sh,"import backup");
  sh.appendChild(el("div","note","The file holds "+nb+" "+(nb===1?"block":"blocks")+", "+
    Object.keys(p.clients||{}).length+" clients, "+
    Object.keys(p.invoices||{}).length+" invoices and "+
    Object.keys(p.quotes||{}).length+" quotes."));
  var bits=[];
  bits.push("adds "+s.blocks+" new "+(s.blocks===1?"block":"blocks"));
  if(s.updates) bits.push("refreshes "+s.updates+" already here");
  if(s.dupes)   bits.push("skips "+s.dupes+" that duplicate work you already have");
  if(s.stale)   bits.push("ignores "+s.stale+" older "+(s.stale===1?"copy":"copies")+
                          " of blocks already here");
  if(s.clients) bits.push("adds "+(s.clients===1?"the client ":"clients ")+s.names.join(", "));
  sh.appendChild(el("div","note","MERGE "+bits.join(", ")+
    ". Nothing on this device is removed."));
  sh.appendChild(el("div","note","REPLACE discards everything on this device and "+
    "leaves exactly what is in the file. This is how you undo a bad import."));
  var row=el("div","btns");
  var m=el("button","btn solid grow","merge");
  m.onclick=function(){
    try{ applyBackup(p,"merge"); pendingImport=null; closeSheet(); renderAll();
      toast(s.blocks+" added, "+(s.updates+s.dupes+s.stale)+" skipped");
    }catch(e){ toast("couldn't import that file") }};
  var r=el("button","btn grow","replace everything");
  r.onclick=function(){
    if(r.getAttribute("data-sure")!=="1"){
      r.setAttribute("data-sure","1"); r.textContent="tap again to replace"; return }
    try{ applyBackup(p,"replace"); pendingImport=null; closeSheet(); renderAll();
      toast("replaced \u2014 "+allEntries().length+" entries");
    }catch(e){ toast("couldn't import that file") }};
  row.appendChild(m); row.appendChild(r); sh.appendChild(row);
}
$("#importFile").addEventListener("change",function(){
  var f=this.files&&this.files[0];if(!f)return;
  var r=new FileReader();
  r.onload=function(){
    try{
      var p=JSON.parse(r.result);
      if(!p||typeof p!=="object"||(!p.months&&!p.clients))throw 0;
      pendingImport=p; openSheet({kind:"import"});
    }catch(e){toast("that file didn't parse as a backup")}
  };
  r.readAsText(f); this.value="";
});

CORE_SHEETS["import"]=sheetImport;
