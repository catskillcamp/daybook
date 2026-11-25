"use strict";
/* Writing files: the connected folder (desktop), the share sheet (phone), CSV. */

/* ---------- invoice folder (desktop, File System Access) ---------- */
var folderHandle=null, IDB=null;
function idb(){
  if(IDB) return IDB;
  IDB=new Promise(function(res,rej){
    /* still named "daybook": it only holds the connected-folder handle */
    var r=indexedDB.open("daybook",1);
    r.onupgradeneeded=function(){r.result.createObjectStore("kv")};
    r.onsuccess=function(){res(r.result)}; r.onerror=function(){rej(r.error)};
  });
  return IDB;
}
function idbGet(k){return idb().then(function(db){return new Promise(function(res,rej){
  var t=db.transaction("kv","readonly").objectStore("kv").get(k);
  t.onsuccess=function(){res(t.result)}; t.onerror=function(){rej(t.error)}})})}
function idbSet(k,v){return idb().then(function(db){return new Promise(function(res,rej){
  var t=db.transaction("kv","readwrite").objectStore("kv").put(v,k);
  t.onsuccess=function(){res()}; t.onerror=function(){rej(t.error)}})})}
function folderSupported(){return typeof window.showDirectoryPicker==="function"}

function connectFolder(){
  if(!folderSupported()){toast("this browser can't connect a folder — use export instead");return}
  window.showDirectoryPicker({mode:"readwrite",id:"daybook-root"}).then(function(h){
    folderHandle=h; return idbSet("folder",h);
  }).then(function(){ renderSetup(); toast("folder connected"); folderAutoSave(); })
  .catch(function(e){ if(e&&e.name!=="AbortError") toast("couldn't connect that folder") });
}
function restoreFolder(){
  if(!folderSupported()) return Promise.resolve();
  return idbGet("folder").then(function(h){
    if(!h) return;
    return h.queryPermission({mode:"readwrite"}).then(function(p){
      folderHandle=h; folderHandle._perm=p; renderSetup();
    });
  }).catch(function(){});
}
function ensureFolderPermission(){
  if(!folderHandle) return Promise.resolve(false);
  return folderHandle.queryPermission({mode:"readwrite"}).then(function(p){
    if(p==="granted") return true;
    return folderHandle.requestPermission({mode:"readwrite"}).then(function(q){return q==="granted"});
  }).catch(function(){return false});
}
function writeIntoFolder(parts,text){
  return ensureFolderPermission().then(function(ok){
    if(!ok) return false;
    var dir=Promise.resolve(folderHandle);
    parts.slice(0,-1).forEach(function(p){
      dir=dir.then(function(d){return d.getDirectoryHandle(p,{create:true})});
    });
    return dir.then(function(d){return d.getFileHandle(parts[parts.length-1],{create:true})})
      .then(function(fh){return fh.createWritable()})
      .then(function(w){return w.write(text).then(function(){return w.close()})})
      .then(function(){return true});
  }).catch(function(){return false});
}
var autoSaveT=null;
/* With Google Drive connected, Drive holds the one copy every device mirrors,
   so the connected folder steps aside rather than keep a second copy. */
function folderAutoSave(){
  if(!folderHandle) return;
  if(typeof driveOn==="function"&&driveOn()) return;
  clearTimeout(autoSaveT);
  autoSaveT=setTimeout(writeStore,1500);
}
/* The JSON store is the only thing worth writing on every change: it is the
   record, and everything else in the folder is derived from it. The per-client
   sheets are an export for reading in a spreadsheet, nobody reads them back,
   and writing them on every clock-out just churned the folder. They are on the
   "write master sheets" button now. */
function writeStore(){
  if(!folderHandle) return Promise.resolve();
  var dd=safeName(S.settings.dataDir||"Radicchio Data");
  return writeIntoFolder([dd,"radicchio-data.json"],JSON.stringify(S,null,1));
}
/* The master sheets are derived, not accumulated: each is regenerated in full
   from the JSON every time, so they can never double up or fall behind. */
function writeAllDerived(){
  if(!folderHandle) return Promise.resolve();
  var dd=safeName(S.settings.dataDir||"Radicchio Data");
  var jobs=[writeStore()];
  var byClient={};
  allEntries().forEach(function(b){(byClient[b.clientId]=byClient[b.clientId]||[]).push(b)});
  Object.keys(byClient).forEach(function(cid){
    jobs.push(writeIntoFolder([dd,safeName(clientName(cid))+" hours.csv"],toCsv(byClient[cid])));
  });
  return Promise.all(jobs);
}

/* ---------- delivery ---------- */
/* driveParts, when given, is where the file goes in the Radicchio folder on
   Google Drive (e.g. ["Invoices", client, name]). With Drive connected that is
   the only place it goes; otherwise the connected folder, else the share sheet. */
function deliver(parts,text,mime,driveParts){
  var filename=parts[parts.length-1];
  if(driveParts&&typeof driveOn==="function"&&driveOn()){
    driveSaveFile(driveParts,text,mime).then(function(){
      toast("saved to Drive: "+[DRIVE_ROOT].concat(driveParts).join("/"));
    }).catch(function(e){
      toast("couldn't save to Drive — "+e.message);
      if(folderHandle) writeIntoFolder(parts,text); else share();
    });
    return;
  }
  if(folderHandle&&!(typeof driveOn==="function"&&driveOn())){
    writeIntoFolder(parts,text).then(function(ok){
      if(ok) toast("saved to "+parts.join("/"));
      else share();
    });
    return;
  }
  share();
  function share(){
    var blob=new Blob([text],{type:mime||"text/plain;charset=utf-8"});
    /* Android's share sheet takes files by type, and .json is not on the
       list it accepts. The bytes are plain text either way, so offer the
       same content as .txt rather than dropping to a download that lands in
       a folder nobody opens. Import reads either extension. */
    var tries=[[filename,blob.type]];
    if(/\.json$/i.test(filename))
      tries.push([filename.replace(/\.json$/i,".txt"),"text/plain;charset=utf-8"]);
    for(var i=0;i<tries.length;i++){
      try{
        var b=i?new Blob([text],{type:tries[i][1]}):blob;
        var f=new File([b],tries[i][0],{type:tries[i][1]});
        if(navigator.canShare&&navigator.canShare({files:[f]})&&navigator.share){
          (function(nm,bl){
            navigator.share({files:[f],title:nm}).then(function(){toast("sent")})
            .catch(function(err){if(!err||err.name!=="AbortError")anchor(bl,nm)});
          })(tries[i][0],b);
          return;
        }
      }catch(e){}
    }
    anchor(blob,filename);
  }
  function anchor(blob,fn){
    try{var u=URL.createObjectURL(blob),a=document.createElement("a");
      a.href=u;a.download=fn;document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(u)},4000); toast("saved to downloads");
    }catch(e){toast("couldn't hand off the file")}
  }
}
function stamp(){var d=new Date();return ymd(d.getTime())+"_"+pad(d.getHours())+pad(d.getMinutes())}

/* ---------- csv ---------- */
function csvCell(v){var s=String(v==null?"":v);return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function toCsv(list){
  var head=["date","day","client","start","end","location","hours_worked","hours_billed","rate","amount","note","invoiced","invoice","entry_id"];
  var rows=[head.join(",")];
  list.slice().sort(function(a,b){return a.start-b.start}).forEach(function(b){
    var rw=rawHours(b),rd=roundHours(rw),rt=rateFor(b);
    rows.push([ymd(b.start),dlong(b.start),clientName(b.clientId),t12(b.start),t12(b.end),
      placeLabel(b.place),rw.toFixed(4),rd.toFixed(2),rt?rt.toFixed(2):"",rt?(rd*rt).toFixed(2):"",
      noteText(b),isInvoiced(b)?"yes":"no",
      b.invoiceId&&S.invoices[b.invoiceId]?S.invoices[b.invoiceId].number:"",b.id
    ].map(csvCell).join(","));
  });
  return rows.join("\r\n")+"\r\n";
}
