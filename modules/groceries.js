/* Groceries module: grocery spending against a weekly budget, billed weekly.

   Each week (Monday to Sunday) has a budget: the default, or an amount set for
   that week (a special occasion). The running balance is every week's budget
   since the start date, minus everything spent since then. While it's zero or
   above, spending averages out at or under budget.

   Each week's budget waits to be billed, like time blocks, and is ticked onto
   an invoice from either invoice sheet as "Groceries — week of …".

   Receipt photos are optional. They're kept on this device only, in their own
   IndexedDB database, not in S: photos would quickly fill localStorage, and
   they don't go into backups or sync.

   Data, in modData("groceries"):
     prefs:    {budget:"250", start:"YYYY-MM-DD" | "", clientId:"" | <id> | "none", updatedAt}
     expenses: {<id>: {id, date:"YYYY-MM-DD", store, amount, note, hasPhoto, updatedAt,
                       kind?:"other", bill?:true, invoiceId?}}
               ("other" expenses don't count against the budget; with bill:true each
               one waits to be billed at its own amount)
     weeks:    {<YYYY-MM-DD of the Monday>: {id, budget ("" = default), invoiceId?, updatedAt}} */
(function(){
"use strict";
if(!moduleOn("groceries")) return;

function D(){
  var d=modData("groceries");
  if(!d.prefs) d.prefs={budget:"250",start:"",clientId:"",updatedAt:1};
  if(!d.expenses) d.expenses={};
  if(!d.weeks) d.weeks={};
  return d;
}
function num(v){ var n=parseFloat(v); return isFinite(n)?n:0 }
function r2(n){ return Math.round(n*100)/100 }
/* "YYYY-MM-DD" → local midnight, ms */
function dms(s){ var p=String(s||"").split("-"); return new Date(+p[0],+p[1]-1,+p[2]).getTime() }
function weekOf(date){ return ymd(startOfWeek(dms(date))) }
function thisWeek(){ return ymd(startOfWeek(now())) }
function weekLabel(wk){ return "week of "+dateWords(wk) }

function isOther(e){ return e.kind==="other" }
/* Grocery expenses by default; "other" for the rest, "all" for both. */
function expensesList(kind){
  var e=D().expenses;
  kind=kind||"grocery";
  return Object.keys(e).map(function(k){return e[k]})
    .filter(function(x){ return kind==="all"||(kind==="other")===isOther(x) })
    .sort(function(a,b){return String(b.date).localeCompare(String(a.date))||((b.updatedAt||0)-(a.updatedAt||0))});
}
/* The first week counted: the start date's week, else the first expense's, else this week. */
function startWeek(){
  var p=D().prefs;
  if(p.start) return weekOf(p.start);
  var l=expensesList();
  return l.length?weekOf(l[l.length-1].date):thisWeek();
}
/* Every week from the start to this one, oldest first. */
function weekKeys(){
  var out=[], wk=startWeek(), end=thisWeek(), guard=0;
  while(wk<=end&&guard++<1000){ out.push(wk); wk=ymd(startOfWeek(addDays(dms(wk),7))) }
  return out;
}
function budgetFor(wk){
  var w=D().weeks[wk];
  return (w&&w.budget!==""&&w.budget!=null)?num(w.budget):num(D().prefs.budget);
}
function spentIn(wk){
  return r2(expensesList().filter(function(e){return weekOf(e.date)===wk})
    .reduce(function(a,e){return a+num(e.amount)},0));
}
function summary(){
  var ks=weekKeys(), cur=thisWeek(), budget=0, spent=0, done=0, doneSpent=0;
  ks.forEach(function(k){
    var s=spentIn(k); budget+=budgetFor(k); spent+=s;
    if(k!==cur){ done++; doneSpent+=s }
  });
  return {weeks:ks.length, budget:r2(budget), spent:r2(spent), balance:r2(budget-spent),
    avg:done?r2(doneSpent/done):null, weekSpent:spentIn(cur), weekBudget:budgetFor(cur)};
}
/* Set something on a week's record, creating it if needed. */
function touchWeek(wk,fields){
  var ws=D().weeks;
  ws[wk]=Object.assign({id:wk,budget:""},ws[wk]||{},fields,{updatedAt:now()});
  return ws[wk];
}

/* ---------- receipt photos: IndexedDB, this device only ---------- */
var PDB=null;
function pdb(){
  if(PDB) return PDB;
  PDB=new Promise(function(res,rej){
    var r=indexedDB.open("radicchio-groceries",1);
    r.onupgradeneeded=function(){ r.result.createObjectStore("photos") };
    r.onsuccess=function(){ res(r.result) }; r.onerror=function(){ rej(r.error) };
  });
  return PDB;
}
function photoReq(mode,fn){
  return pdb().then(function(db){ return new Promise(function(res,rej){
    var q=fn(db.transaction("photos",mode).objectStore("photos"));
    q.onsuccess=function(){ res(q.result) }; q.onerror=function(){ rej(q.error) };
  })});
}
function getPhoto(id){ return photoReq("readonly",function(s){return s.get(id)}).catch(function(){return null}) }
function putPhoto(id,blob){ return photoReq("readwrite",function(s){return s.put(blob,id)}) }
function delPhoto(id){ return photoReq("readwrite",function(s){return s.delete(id)}).catch(function(){}) }
/* Shrink a camera photo to at most 1600px on its long side, as a JPEG. */
function shrink(file){
  return new Promise(function(res){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      var w=img.naturalWidth, h=img.naturalHeight, k=Math.min(1,1600/Math.max(w,h));
      var c=document.createElement("canvas"); c.width=Math.round(w*k); c.height=Math.round(h*k);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function(b){ res(b||file) },"image/jpeg",0.8);
    };
    img.onerror=function(){ URL.revokeObjectURL(url); res(file) };
    img.src=url;
  });
}
/* Photos left behind by a new expense that was never saved. */
var swept=false;
function sweepPhotos(){
  if(swept) return; swept=true;
  photoReq("readonly",function(s){return s.getAllKeys()}).then(function(keys){
    var ex=D().expenses, open=UI.sheet&&UI.sheet.draft&&UI.sheet.draft.rec&&UI.sheet.draft.rec.id;
    (keys||[]).forEach(function(k){ if(!ex[k]&&k!==open) delPhoto(k) });
  }).catch(function(){});
}
function showPhoto(blob,name){
  var url=URL.createObjectURL(blob);
  var ov=el("div","gro-ov"), im=el("img"); im.src=url; im.alt="receipt";
  var btns=el("div","btns");
  var cl=el("button","btn grow","close"); cl.type="button";
  var sv=el("button","btn grow","save photo"); sv.type="button";
  function close(){ ov.remove(); URL.revokeObjectURL(url) }
  cl.onclick=close;
  im.onclick=close;
  sv.onclick=function(){
    var f=new File([blob],safeName(name)+".jpg",{type:blob.type||"image/jpeg"});
    if(navigator.canShare&&navigator.canShare({files:[f]})&&navigator.share){
      navigator.share({files:[f],title:f.name}).catch(function(){});
      return;
    }
    var a=document.createElement("a"); a.href=url; a.download=f.name;
    document.body.appendChild(a); a.click(); a.remove(); toast("saved to downloads");
  };
  btns.appendChild(cl); btns.appendChild(sv);
  ov.appendChild(im); ov.appendChild(btns);
  document.body.appendChild(ov);
}

/* ---------- the groceries tab ---------- */
function render(){
  /* core puts module tabs just before invoices; this one goes before blocks */
  var gb=document.querySelector('nav button[data-tab="groceries"]'),
      bb=document.querySelector('nav button[data-tab="blocks"]');
  if(gb&&bb&&gb.nextElementSibling!==bb) bb.parentNode.insertBefore(gb,bb);
  var p=$("#p-groceries"); if(!p) return; p.innerHTML="";
  p.classList.add("gro");
  sweepPhotos();
  var s=summary();

  var h=el("div","h");
  h.appendChild(el("span","cap","groceries"));
  var bs=el("span");
  var add=el("button","btn bare","+ add expense"); add.type="button";
  add.onclick=function(){ openSheet({kind:"grocery"}) };
  var st=el("button","btn bare","settings"); st.type="button"; st.style.marginLeft="16px";
  st.onclick=function(){ openSheet({kind:"grocerysettings"}) };
  bs.appendChild(add); bs.appendChild(st); h.appendChild(bs); p.appendChild(h);

  /* the number that matters: what can still be spent this week */
  p.appendChild(el("div","big"+(s.balance<0?" over":""),money(Math.abs(s.balance))));
  p.appendChild(el("div","bigsub",s.balance>=0
    ? "left to spend this week and stay on budget"
    : "over budget overall — spend less in the coming weeks"));

  var t=el("div","tally");
  [["this week",money(s.weekSpent)+" / "+money(s.weekBudget)],
   ["avg / finished week",s.avg==null?"—":money(s.avg)],
   ["since "+dateWords(startWeek()),money(s.spent)+" / "+money(s.budget)]].forEach(function(x){
    var sp=el("span"); sp.appendChild(document.createTextNode(x[0])); sp.appendChild(el("b",null,x[1])); t.appendChild(sp);
  });
  p.appendChild(t);

  /* weeks, newest first */
  var sec=el("div","sec"), wh=el("div","h");
  wh.appendChild(el("span","cap","weeks")); sec.appendChild(wh);
  var log=el("div","log");
  weekKeys().slice().reverse().forEach(function(wk){
    var b=budgetFor(wk), sp=spentIn(wk), w=D().weeks[wk]||{}, diff=r2(b-sp);
    var row=el("div","row"), body=el("div","body"), l1=el("div","l1");
    l1.appendChild(el("span",null,weekLabel(wk)));
    l1.appendChild(el("span","hrs",money(sp)+" / "+money(b)));
    body.appendChild(l1);
    var inv=w.invoiceId&&S.invoices[w.invoiceId];
    var bits=[diff>=0?"under by "+money(diff):"over by "+money(-diff)];
    if(w.budget!==""&&w.budget!=null) bits.push("budget set for this week");
    bits.push(inv?"billed "+(inv.number||""):"not billed yet");
    body.appendChild(el("div","place",bits.join(" · ")));
    row.appendChild(body);
    row.onclick=function(){ openSheet({kind:"groceryweek",wk:wk}) };
    row.tabIndex=0;
    log.appendChild(row);
  });
  sec.appendChild(log); p.appendChild(sec);

  /* recent grocery expenses */
  var sec2=el("div","sec"), eh=el("div","h");
  eh.appendChild(el("span","cap","recent groceries")); sec2.appendChild(eh);
  var list=expensesList().slice(0,15);
  if(!list.length) sec2.appendChild(el("div","empty","Nothing yet. Tap + add expense after a shop."));
  else sec2.appendChild(expenseLog(list));
  p.appendChild(sec2);

  /* other expenses: not part of the grocery budget */
  var others=expensesList("other");
  var sec3=el("div","sec"), oh=el("div","h");
  var waiting=others.filter(function(e){return e.bill&&!e.invoiceId});
  oh.appendChild(el("span","cap","other expenses"));
  oh.appendChild(el("span","dim",waiting.length?money(r2(waiting.reduce(function(a,e){return a+num(e.amount)},0)))+" to bill":""));
  sec3.appendChild(oh);
  if(!others.length) sec3.appendChild(el("div","empty","None yet. Use + add expense and choose other."));
  else sec3.appendChild(expenseLog(others.slice(0,20)));
  p.appendChild(sec3);
}
function expenseLog(list){
  var log=el("div","log");
  list.forEach(function(e){
    var row=el("div","row"), body=el("div","body"), l1=el("div","l1");
    var o=isOther(e), inv=e.invoiceId&&S.invoices[e.invoiceId];
    l1.appendChild(el("span",null,o?(e.note||e.store||"expense"):(e.store||"groceries")));
    l1.appendChild(el("span","hrs",money(num(e.amount))));
    body.appendChild(l1);
    var bits=[dateWords(e.date)];
    if(o&&e.store&&e.note) bits.push(e.store);
    if(!o&&e.note) bits.push(e.note);
    if(e.hasPhoto) bits.push("receipt");
    if(o) bits.push(inv?"billed "+(inv.number||""):(e.bill?"not billed yet":"not for invoice"));
    body.appendChild(el("div","place",bits.join(" · ")));
    row.appendChild(body);
    row.onclick=function(){ UI.sheet=null; openSheet({kind:"grocery",id:e.id}) };
    row.tabIndex=0;
    log.appendChild(row);
  });
  return log;
}

/* ---------- an expense ---------- */
function sheetExpense(sh,d){
  var data=D(), isNew=!d.id, e;
  if(isNew){
    if(!d.draft.rec) d.draft.rec={id:uid(),date:d.date||ymd(now()),store:"",amount:"",note:"",hasPhoto:false,
      kind:d.other?"other":"grocery",bill:true};
  }else{
    if(!data.expenses[d.id]){ closeSheet(); return }
    if(!d.draft.rec) d.draft.rec=JSON.parse(JSON.stringify(data.expenses[d.id]));
  }
  e=d.draft.rec;
  if(!e.kind) e.kind="grocery";
  if(e.bill==null) e.bill=true;
  var o=e.kind==="other", locked=!!(o&&e.invoiceId);
  head(sh,isNew?"add expense":(locked?"expense (billed)":"edit expense"));
  if(locked) sh.appendChild(el("div","note","Billed on "+((S.invoices[e.invoiceId]||{}).number||"an invoice")+". Void that invoice to change this expense."));
  function seg(label,opts,val,onPick){
    var f=el("div","field"); f.appendChild(el("span",null,label));
    var w=el("div","seg");
    opts.forEach(function(op){
      var bt=el("button",null,op[1]); bt.type="button"; bt.disabled=locked;
      bt.setAttribute("aria-pressed",val===op[0]?"true":"false");
      bt.onclick=function(){ onPick(op[0]); touch(); paintSheet() };
      w.appendChild(bt);
    });
    f.appendChild(w); sh.appendChild(f);
  }
  seg("kind",[["grocery","groceries"],["other","other"]],e.kind,function(v){ e.kind=v });
  if(o){
    seg("add to invoice",[[true,"yes"],[false,"no"]],!!e.bill,function(v){ e.bill=v });
    sh.appendChild(el("div","khint","Other expenses don't count against the grocery budget."+
      (e.bill?" This one waits to be billed at its full amount.":" This one is for your records only.")));
  }
  var dt=fieldOf(sh,"date",inp("date",e.date||ymd(now())));
  var am=el("input"); am.type="number"; am.step="0.01"; am.setAttribute("inputmode","decimal");
  am.placeholder="0.00"; am.value=e.amount||"";
  fieldOf(sh,"amount",am);
  var nt=null;
  if(o) nt=fieldOf(sh,"what it was",inp("text",e.note||"","e.g. sheet pans, propane"));
  var sto=fieldOf(sh,"store",inp("text",e.store||"",o?"optional":"e.g. Hannaford, farm stand"));
  if(!o) nt=fieldOf(sh,"note",inp("text",e.note||"","optional"));
  dt.addEventListener("input",function(){ e.date=dt.value; touch() });
  am.addEventListener("input",function(){ e.amount=am.value; touch() });
  sto.addEventListener("input",function(){ e.store=sto.value; touch() });
  nt.addEventListener("input",function(){ e.note=nt.value; touch() });

  /* receipt photo */
  sh.appendChild(el("div","field")).appendChild(el("span",null,"receipt photo"));
  var pbox=el("div"); sh.appendChild(pbox);
  var fi=el("input"); fi.type="file"; fi.accept="image/*"; fi.hidden=true; sh.appendChild(fi);
  function paintPhoto(){
    pbox.innerHTML="";
    var row=el("div");
    var pick=el("button","btn bare",e.hasPhoto?"replace photo":"+ add photo"); pick.type="button";
    pick.onclick=function(){ fi.click() };
    row.appendChild(pick);
    if(e.hasPhoto){
      var rm=el("button","btn bare","remove photo"); rm.type="button"; rm.style.marginLeft="16px";
      rm.onclick=function(){ e.hasPhoto=false; touch(); paintPhoto() };
      row.appendChild(rm);
      getPhoto(e.id).then(function(b){
        if(!b) return;
        var u=URL.createObjectURL(b), im=el("img","gro-thumb"); im.src=u; im.alt="receipt";
        im.onclick=function(){ showPhoto(b,"Receipt "+(e.date||"")+" "+(e.store||"")) };
        pbox.insertBefore(im,pbox.firstChild);
      });
    }
    pbox.appendChild(row);
  }
  fi.addEventListener("change",function(){
    var f=fi.files&&fi.files[0]; if(!f) return;
    toast("adding photo…");
    shrink(f).then(function(b){ return putPhoto(e.id,b) }).then(function(){
      e.hasPhoto=true; touch(); paintPhoto(); toast("photo added");
    }).catch(function(){ toast("couldn't keep that photo") });
    fi.value="";
  });
  paintPhoto();
  sh.appendChild(el("div","khint","Photos stay on this device only. They aren't in backups."));

  if(locked) Array.prototype.forEach.call(sh.querySelectorAll("input"),function(n){ n.disabled=true });
  var btns=el("div","btns");
  if(locked){
    var cl=el("button","btn grow","close"); cl.type="button"; cl.onclick=closeSheet;
    btns.appendChild(cl); sh.appendChild(btns); return;
  }
  var sv=el("button","btn solid grow","save"); sv.type="button";
  sv.onclick=function(){
    if(!(num(e.amount)>0)){ toast("enter the amount"); return }
    if(!e.date){ toast("pick a date"); return }
    if(o&&!(e.note||"").trim()&&!(e.store||"").trim()){ toast("say what it was"); return }
    var rec={id:e.id,date:e.date,store:(e.store||"").trim(),amount:String(r2(num(e.amount))),
      note:(e.note||"").trim(),hasPhoto:!!e.hasPhoto,updatedAt:now()};
    if(o){ rec.kind="other"; rec.bill=!!e.bill; if(e.invoiceId) rec.invoiceId=e.invoiceId }
    if(!rec.hasPhoto) delPhoto(rec.id);
    var p=D().prefs;
    if(!o&&!p.start&&!expensesList().length){ p.start=weekOf(rec.date); p.updatedAt=now() }
    D().expenses[rec.id]=rec; save();
    UI.sheet=null; saveUI(); closeSheet(); renderAll(); toast(isNew?"expense saved":"expense updated");
  };
  btns.appendChild(sv);
  if(!isNew){
    var del=el("button","btn","delete"); del.type="button";
    del.onclick=function(){
      if(!del.dataset.armed){ del.dataset.armed="1"; del.textContent="delete — tap again"; return }
      delete D().expenses[e.id]; delPhoto(e.id); save();
      UI.sheet=null; saveUI(); closeSheet(); renderAll(); toast("expense deleted");
    };
    btns.appendChild(del);
  }
  sh.appendChild(btns);
}

/* ---------- a week ---------- */
function sheetWeek(sh,d){
  var wk=d.wk, w=D().weeks[wk]||{}, inv=w.invoiceId&&S.invoices[w.invoiceId];
  head(sh,weekLabel(wk));
  var b=el("input"); b.type="number"; b.step="0.01"; b.setAttribute("inputmode","decimal");
  b.placeholder=String(num(D().prefs.budget)); b.value=(w.budget==null?"":w.budget);
  fieldOf(sh,"budget for this week",b);
  if(inv){
    b.disabled=true;
    sh.appendChild(el("div","note","Billed on "+(inv.number||"an invoice")+". Void that invoice to change this week's budget."));
  }else{
    sh.appendChild(el("div","khint","Leave blank for the usual "+money(num(D().prefs.budget))+
      ". For a special occasion, enter the amount you agreed. The invoice bills this amount."));
    b.addEventListener("change",function(){
      touchWeek(wk,{budget:b.value===""?"":String(r2(num(b.value)))}); save(); renderAll(); paintSheet();
    });
  }
  var sp=spentIn(wk), bud=budgetFor(wk);
  var tot=el("div","subtot");
  tot.appendChild(el("span","sc","spent of "+money(bud)));
  tot.appendChild(el("b",null,money(sp)));
  sh.appendChild(tot);

  var list=expensesList().filter(function(e){return weekOf(e.date)===wk});
  if(list.length) sh.appendChild(expenseLog(list));
  else sh.appendChild(el("div","empty","No expenses this week."));

  var btns=el("div","btns");
  var add=el("button","btn grow","+ add expense"); add.type="button";
  add.onclick=function(){
    var today=ymd(now()), day=weekOf(today)===wk?today:wk;
    UI.sheet=null; openSheet({kind:"grocery",date:day});
  };
  var done=el("button","btn solid grow","done"); done.type="button"; done.onclick=closeSheet;
  btns.appendChild(add); btns.appendChild(done); sh.appendChild(btns);
}

/* ---------- settings ---------- */
function sheetSettings(sh){
  var p=D().prefs;
  head(sh,"grocery settings");
  function stamp(){ p.updatedAt=now(); save(); renderAll() }
  var b=el("input"); b.type="number"; b.step="0.01"; b.setAttribute("inputmode","decimal"); b.value=p.budget||"";
  fieldOf(sh,"usual weekly budget",b);
  b.addEventListener("change",function(){ p.budget=String(r2(num(b.value))); stamp() });
  var sd=fieldOf(sh,"count from",inp("date",p.start||startWeek()));
  sd.addEventListener("change",function(){ p.start=sd.value; stamp() });
  sh.appendChild(el("div","khint","The average and balance count every week from this date's week (weeks run Monday to Sunday)."));
  var sc=el("select");
  var cs=liveClients();
  [["","the client on the invoice"]].concat(cs.map(function(c){return [c.id,c.name]}))
    .concat([["none","don't add groceries to invoices"]]).forEach(function(o){
      var x=el("option",null,o[1]); x.value=o[0]; sc.appendChild(x);
    });
  sc.value=p.clientId||"";
  fieldOf(sh,"bill groceries to",sc);
  sc.addEventListener("change",function(){ p.clientId=sc.value; stamp() });
  sh.appendChild(el("div","khint","Each week's grocery budget appears under “waiting to be billed” when you make an invoice. Untick it there to leave it off."));
  sh.appendChild(el("div","note","Receipt photos are kept on this device only. They aren't included in backups or moved to other devices. To keep one elsewhere, open it and tap save photo."));
  var btns=el("div","btns"), done=el("button","btn solid grow","done"); done.type="button"; done.onclick=closeSheet;
  btns.appendChild(done); sh.appendChild(btns);
}

/* ---------- billing ---------- */
function billables(cid){
  var p=D().prefs;
  if(p.clientId==="none"||(p.clientId&&p.clientId!==cid)) return [];
  var others=expensesList("other").filter(function(e){ return e.bill&&!e.invoiceId&&num(e.amount)>0 })
    .reverse().map(function(e){
      var what=e.note||e.store||"Expense", amt=r2(num(e.amount));
      return {key:"groceries-other:"+e.id, label:what+" · "+dateWords(e.date), amount:amt,
        item:{desc:what+(e.note&&e.store?" ("+e.store+")":""),qty:"1",unit:"",rate:String(amt),
          source:"groceries",date:e.date,ref:"groceries-other:"+e.id},
        bill:function(invoiceId){ var x=D().expenses[e.id]; if(x){ x.invoiceId=invoiceId; x.updatedAt=now() } }};
    });
  return weekKeys().filter(function(wk){
    var w=D().weeks[wk]; return !(w&&w.invoiceId)&&budgetFor(wk)>0;
  }).map(function(wk){
    var amt=budgetFor(wk);
    return {key:"groceries:"+wk, label:"Groceries · "+weekLabel(wk), amount:amt,
      item:{desc:"Groceries — week of",qty:"1",unit:"",rate:String(amt),source:"groceries",date:wk,ref:"groceries:"+wk},
      bill:function(invoiceId){ touchWeek(wk,{invoiceId:invoiceId}) }};
  }).concat(others);
}
function onVoid(inv){
  var ws=D().weeks;
  for(var k in ws) if(ws[k].invoiceId===inv.id){ delete ws[k].invoiceId; ws[k].updatedAt=now() }
  var ex=D().expenses;
  for(var id in ex) if(ex[id].invoiceId===inv.id){ delete ex[id].invoiceId; ex[id].updatedAt=now() }
}

registerModule({
  id:"groceries",
  render:render,
  tab:{key:"groceries",label:"groceries"},
  sheets:{grocery:sheetExpense,groceryweek:sheetWeek,grocerysettings:sheetSettings},
  billables:billables,
  onVoid:onVoid,
  css:[
    ".gro>.h{display:flex;justify-content:space-between;align-items:baseline;margin-top:18px}",
    ".gro .big{font-size:34px;letter-spacing:.02em;margin:22px 0 0;font-variant-numeric:tabular-nums}",
    ".gro .big.over{color:var(--dim)}",
    ".gro .bigsub{font-size:var(--fs-xs);color:var(--dim);text-transform:uppercase;letter-spacing:.12em}",
    ".gro .tally{display:flex;flex-wrap:wrap;gap:6px 22px;margin:16px 0 4px;font-size:var(--fs-sm);color:var(--dim)}",
    ".gro .tally b{color:var(--fg);font-weight:500;margin-left:8px}",
    ".gro-thumb{display:block;max-width:160px;max-height:160px;border:1px solid var(--line-2);margin:6px 0 4px;cursor:zoom-in}",
    ".gro-ov{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.94);display:flex;flex-direction:column;",
    "  align-items:center;justify-content:center;padding:16px}",
    ".gro-ov img{max-width:100%;max-height:80vh;object-fit:contain}",
    ".gro-ov .btns{width:100%;max-width:420px;margin-top:14px}"
  ].join("\n")
});
})();
