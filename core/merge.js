"use strict";
/* Three-way merge, for sync between devices.

   Each device keeps a copy of the data as it was at its last sync: the base.
   Comparing base, this device and Drive record by record shows who changed
   what:

     same on both sides            → keep it
     only this device changed it   → this device's version
     only Drive changed it         → Drive's version
     both changed it               → the one with the newer updatedAt
                                     (a tie keeps this device's); an edit
                                     beats a delete
     deleted on one side, untouched on the other → deleted

   Because the base records what existed, deletions sync without any special
   markers in the data, and nothing else in the app has to know about sync.

   A "unit" is the smallest piece merged on its own: one client, block,
   invoice, quote or template; one field of business or settings; the running
   timer; one record of a module's collection. */

function syncUnits(s){
  var u={};
  function put(path,v){ if(v!==undefined) u[JSON.stringify(path)]=v }
  s=s||{};
  for(var id in (s.clients||{}))    put(["client",id],s.clients[id]);
  for(var mk in (s.months||{})) for(var bid in s.months[mk]) put(["block",bid],s.months[mk][bid]);
  for(var iid in (s.invoices||{}))  put(["invoice",iid],s.invoices[iid]);
  for(var qid in (s.quotes||{}))    put(["quote",qid],s.quotes[qid]);
  for(var tid in (s.qtemplates||{}))put(["qtpl",tid],s.qtemplates[tid]);
  for(var bk in (s.business||{}))   put(["biz",bk],s.business[bk]);
  for(var sk in (s.settings||{}))   put(["set",sk],s.settings[sk]);
  put(["active"],s.active===undefined?null:s.active);
  var mods=s.mods||{};
  for(var mid in mods){
    var md=mods[mid];
    if(!md||typeof md!=="object"||Array.isArray(md)){ put(["modv",mid],md); continue }
    for(var key in md){
      var v=md[key];
      if(isCollection(v)){
        put(["modc",mid,key],1);                      /* the collection exists, even empty */
        for(var rid in v) put(["modr",mid,key,rid],v[rid]);
      }else put(["modk",mid,key],v);
    }
  }
  /* any other top-level key a later version adds is merged as one piece */
  var known={clients:1,months:1,invoices:1,quotes:1,qtemplates:1,business:1,settings:1,active:1,mods:1};
  for(var top in s) if(!known[top]) put(["top",top],s[top]);
  return u;
}
/* An object whose every value is a plain object is a collection of records. */
function isCollection(v){
  if(!v||typeof v!=="object"||Array.isArray(v)) return false;
  for(var k in v){ var x=v[k]; if(!x||typeof x!=="object"||Array.isArray(x)) return false }
  return true;
}
function stampOf(v){ return v&&typeof v==="object" ? (+v.updatedAt||+v.createdAt||0) : 0 }

function merge3(base,local,remote){
  var B=syncUnits(base), L=syncUnits(local), R=syncUnits(remote), out={};
  var keys={}, k;
  for(k in B) keys[k]=1; for(k in L) keys[k]=1; for(k in R) keys[k]=1;
  for(k in keys){
    var b=k in B?JSON.stringify(B[k]):undefined,
        l=k in L?JSON.stringify(L[k]):undefined,
        r=k in R?JSON.stringify(R[k]):undefined, pick;
    if(l===r)      pick=l;
    else if(l===b) pick=r;                 /* only Drive changed it */
    else if(r===b) pick=l;                 /* only this device changed it */
    else if(l===undefined) pick=r;         /* deleted here, edited there: keep the edit */
    else if(r===undefined) pick=l;
    else pick = stampOf(R[k])>stampOf(L[k]) ? r : l;
    if(pick!==undefined) out[k]=JSON.parse(pick);
  }
  return fromUnits(out);
}

function fromUnits(u){
  var s={clients:{},business:{},settings:{},active:null,months:{},invoices:{},quotes:{},qtemplates:{},mods:{}};
  for(var key in u){
    var p=JSON.parse(key), v=u[key];
    switch(p[0]){
      case "client":  s.clients[p[1]]=v; break;
      case "block":   var mk=monthKey(v.start); (s.months[mk]=s.months[mk]||{})[p[1]]=v; break;
      case "invoice": s.invoices[p[1]]=v; break;
      case "quote":   s.quotes[p[1]]=v; break;
      case "qtpl":    s.qtemplates[p[1]]=v; break;
      case "biz":     s.business[p[1]]=v; break;
      case "set":     s.settings[p[1]]=v; break;
      case "active":  s.active=v; break;
      case "modv":    s.mods[p[1]]=v; break;
      case "modk":    (s.mods[p[1]]=s.mods[p[1]]||{})[p[2]]=v; break;
      case "modc":    var m=(s.mods[p[1]]=s.mods[p[1]]||{}); m[p[2]]=m[p[2]]||{}; break;
      case "modr":    var m2=(s.mods[p[1]]=s.mods[p[1]]||{}); (m2[p[2]]=m2[p[2]]||{})[p[3]]=v; break;
      case "top":     s[p[1]]=v; break;
    }
  }
  return s;
}
/* Two copies hold the same data, whatever order their keys are in. */
function sameData(a,b){
  var A=syncUnits(a), B=syncUnits(b), k;
  for(k in A) if(!(k in B)||JSON.stringify(A[k])!==JSON.stringify(B[k])) return false;
  for(k in B) if(!(k in A)) return false;
  return true;
}
