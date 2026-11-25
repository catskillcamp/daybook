/* Prints module: price and bill 3D print jobs.

   price = (grams × material $/g + print hours × machine $/h) × (1 + markup %)

   Rates: defaults on the prints tab, with per-client overrides for the machine
   rate and markup (a friend rate). Each job starts from them, can be edited,
   and keeps the numbers it was priced with. Finished jobs wait per client,
   like time blocks, and are ticked onto an invoice from either invoice sheet.

   Data, in modData("prints"):
     rates:       {machine:"3", markup:"50"}
     materials:   {<id>: {id, name, perGram, updatedAt}}
     clientRates: {<clientId>: {id, machine, markup, updatedAt}}   ("" = use default)
     jobs:        {<id>: {id, clientId, date, desc, materialId, material, grams, hours,
                          perGram, machine, markup, price, invoiceId?, updatedAt}} */
(function(){
"use strict";
if(!moduleOn("prints")) return;

function D(){
  var d=modData("prints");
  if(!d.rates) d.rates={machine:"3",markup:"50"};
  /* fixed ids and stamps, so two devices starting fresh create the same
     records instead of duplicates once they sync */
  if(!d.materials) d.materials={
    pla:{id:"pla",name:"PLA",perGram:"0.05",updatedAt:1},
    petg:{id:"petg",name:"PETG",perGram:"0.06",updatedAt:1}};
  if(!d.clientRates) d.clientRates={};
  if(!d.jobs) d.jobs={};
  return d;
}
function num(v){ var n=parseFloat(v); return isFinite(n)?n:0 }
function materialsList(){ var m=D().materials; return Object.keys(m).map(function(k){return m[k]}).sort(function(a,b){return String(a.name).localeCompare(b.name)}) }
/* the machine rate and markup for a client: its override, else the default */
function ratesFor(cid){
  var d=D(), o=d.clientRates[cid]||{};
  return {machine:(o.machine!==""&&o.machine!=null)?o.machine:d.rates.machine,
          markup:(o.markup!==""&&o.markup!=null)?o.markup:d.rates.markup};
}
function priceOf(j){
  var base=num(j.grams)*num(j.perGram)+num(j.hours)*num(j.machine);
  return Math.round(base*(1+num(j.markup)/100)*100)/100;
}
function jobsList(){ var j=D().jobs; return Object.keys(j).map(function(k){return j[k]}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))||(b.updatedAt-a.updatedAt)}) }
function jobLine(j){ return j.desc||"3D print" }

/* ---------- the prints tab ---------- */
function render(){
  var p=$("#p-prints"); if(!p) return; p.innerHTML="";
  var h=el("div","h"); h.style.display="flex"; h.style.justifyContent="space-between";
  h.appendChild(el("span","cap","prints"));
  var bs=el("span");
  var add=el("button","btn bare","+ new print"); add.onclick=function(){ openSheet({kind:"print"}) };
  var rt=el("button","btn bare","rates"); rt.style.marginLeft="16px"; rt.onclick=function(){ openSheet({kind:"printrates"}) };
  bs.appendChild(add); bs.appendChild(rt); h.appendChild(bs); p.appendChild(h);
  var all=jobsList();
  if(!all.length){ p.appendChild(el("div","empty","No print jobs yet. Tap + new print; set your material and machine rates under rates first.")); return }
  var open=all.filter(function(j){return !j.invoiceId}), done=all.filter(function(j){return j.invoiceId});
  function section(title,list){
    var sec=el("div","sec"), hh=el("div","h");
    var tot=list.reduce(function(a,j){return a+num(j.price)},0);
    hh.appendChild(el("span","cap",title)); hh.appendChild(el("span","dim",list.length?money(Math.round(tot*100)/100):""));
    sec.appendChild(hh);
    if(!list.length){ sec.appendChild(el("div","empty","none")); p.appendChild(sec); return }
    var log=el("div","log");
    list.forEach(function(j){
      var row=el("div","row"), body=el("div","body"), l1=el("div","l1");
      l1.appendChild(el("span",null,jobLine(j))); l1.appendChild(el("span","hrs",money(num(j.price))));
      body.appendChild(l1);
      var inv=j.invoiceId&&S.invoices[j.invoiceId];
      body.appendChild(el("div","place",clientName(j.clientId)+" · "+dateWords(j.date)+" · "+
        num(j.grams)+" g "+(j.material||"")+" · "+num(j.hours)+" h"+(inv?" · billed "+inv.number:"")));
      row.appendChild(body);
      row.onclick=function(){ openSheet({kind:"print",id:j.id}) };
      row.tabIndex=0;
      log.appendChild(row);
    });
    sec.appendChild(log); p.appendChild(sec);
  }
  section("waiting to be billed",open);
  section("billed",done.slice(0,20));
}

/* ---------- a print job ---------- */
function sheetPrint(sh,d){
  var cs=liveClients();
  if(!cs.length){ closeSheet(); toast("add a client in setup first"); return }
  var data=D(), isNew=!d.id, j;
  if(isNew){
    if(!d.draft.rec){
      var c0=cs[0], m0=materialsList()[0]||{}, r0=ratesFor(c0.id);
      d.draft.rec={id:uid(),clientId:c0.id,date:ymd(now()),desc:"",materialId:m0.id||"",material:m0.name||"",
        grams:"",hours:"",perGram:m0.perGram||"0",machine:r0.machine,markup:r0.markup};
    }
    j=d.draft.rec;
  }else{
    if(!data.jobs[d.id]){ closeSheet(); return }
    if(!d.draft.rec) d.draft.rec=JSON.parse(JSON.stringify(data.jobs[d.id]));
    j=d.draft.rec;
  }
  var locked=!!j.invoiceId;
  head(sh,isNew?"new print":(locked?"print (billed)":"edit print"));
  if(locked) sh.appendChild(el("div","note","Billed on "+((S.invoices[j.invoiceId]||{}).number||"an invoice")+". Void that invoice to change this job."));
  var priceLine=el("div","subtot");
  function paintPrice(){
    j.price=priceOf(j);
    priceLine.innerHTML="";
    var base=num(j.grams)*num(j.perGram)+num(j.hours)*num(j.machine);
    priceLine.appendChild(el("span","sc",money(Math.round(base*100)/100)+" + "+num(j.markup)+"%"));
    priceLine.appendChild(el("b",null,money(j.price)));
  }
  var sc=el("select");
  cs.forEach(function(c){var o=el("option",null,c.name);o.value=c.id;sc.appendChild(o)});
  sc.value=j.clientId;
  fieldOf(sh,"client",sc);
  var dt=fieldOf(sh,"date",inp("date",j.date||ymd(now())));
  var ds=fieldOf(sh,"what was printed",inp("text",j.desc||"","e.g. bracket set, 4 pcs"));
  var ms=el("select");
  materialsList().forEach(function(m){var o=el("option",null,m.name+" · "+money(num(m.perGram))+"/g");o.value=m.id;ms.appendChild(o)});
  ms.value=j.materialId;
  fieldOf(sh,"material",ms);
  var two=el("div","two");
  function numField(parent,label,key,step){
    var n=el("input"); n.type="number"; n.step=step||"any"; n.setAttribute("inputmode","decimal"); n.value=j[key]==null?"":j[key];
    var l=el("label","field"); l.appendChild(el("span",null,label)); l.appendChild(n); parent.appendChild(l);
    n.addEventListener("input",function(){ j[key]=n.value; touch(); paintPrice() });
    return n;
  }
  numField(two,"grams","grams"); numField(two,"print hours","hours"); sh.appendChild(two);
  var three=el("div","two");
  var pg=numField(three,"$ per gram","perGram"); numField(three,"machine $/h","machine"); sh.appendChild(three);
  numField(sh,"markup %","markup");
  sh.appendChild(el("div","khint","Rates come from the client's overrides or your defaults (prints → rates). Changing them here affects this job only."));
  sh.appendChild(priceLine); paintPrice();
  sc.addEventListener("change",function(){
    j.clientId=sc.value; var r=ratesFor(j.clientId); j.machine=r.machine; j.markup=r.markup; touch();
    paintSheet();
  });
  dt.addEventListener("input",function(){ j.date=dt.value; touch() });
  ds.addEventListener("input",function(){ j.desc=ds.value; touch() });
  ms.addEventListener("change",function(){
    var m=D().materials[ms.value]||{}; j.materialId=m.id||""; j.material=m.name||""; j.perGram=m.perGram||"0";
    pg.value=j.perGram; touch(); paintPrice();
  });
  if(locked) Array.prototype.forEach.call(sh.querySelectorAll("input,select"),function(n){n.disabled=true});
  var btns=el("div","btns");
  if(!locked){
    var sv=el("button","btn solid grow","save");sv.type="button";
    sv.onclick=function(){
      if(!(num(j.grams)||num(j.hours))){ toast("enter grams or print hours"); return }
      j.price=priceOf(j); j.updatedAt=now();
      D().jobs[j.id]=j; save();
      UI.sheet=null;saveUI();closeSheet();renderAll();toast(isNew?"print saved":"print updated");
    };
    btns.appendChild(sv);
    if(!isNew){
      var del=el("button","btn","delete");del.type="button";
      del.onclick=function(){
        if(!del.dataset.armed){del.dataset.armed="1";del.textContent="delete — tap again";return}
        delete D().jobs[j.id]; save(); UI.sheet=null;saveUI();closeSheet();renderAll();toast("print deleted");
      };
      btns.appendChild(del);
    }
  }else{
    var cl=el("button","btn grow","close");cl.type="button";cl.onclick=closeSheet;btns.appendChild(cl);
  }
  sh.appendChild(btns);
}

/* ---------- rates: defaults, materials, client overrides ---------- */
function sheetRates(sh,d){
  var data=D();
  head(sh,"print rates");
  function bindNum(parent,label,obj,key,onSave){
    var n=el("input"); n.type="number"; n.step="any"; n.setAttribute("inputmode","decimal"); n.value=obj[key]==null?"":obj[key];
    var l=el("label","field"); l.appendChild(el("span",null,label)); l.appendChild(n); parent.appendChild(l);
    n.addEventListener("change",function(){ obj[key]=n.value; if(onSave) onSave(); save(); renderAll() });
    return n;
  }
  sh.appendChild(el("div","field")).appendChild(el("span",null,"defaults"));
  var two=el("div","two");
  bindNum(two,"machine $/h",data.rates,"machine");
  bindNum(two,"markup %",data.rates,"markup");
  sh.appendChild(two);

  sh.appendChild(el("div","field")).appendChild(el("span",null,"materials"));
  materialsList().forEach(function(m){
    var row=el("div","two");
    var nm=inp("text",m.name||"","name");
    var l1=el("label","field"); l1.appendChild(el("span",null,"material")); l1.appendChild(nm); row.appendChild(l1);
    nm.addEventListener("change",function(){ m.name=nm.value.trim()||m.name; m.updatedAt=now(); save(); renderAll() });
    bindNum(row,"$ per gram",m,"perGram",function(){ m.updatedAt=now() });
    sh.appendChild(row);
    var rm=el("button","btn bare","remove "+(m.name||"material")); rm.type="button";
    rm.onclick=function(){
      if(!rm.dataset.armed){rm.dataset.armed="1";rm.textContent="remove — tap again";return}
      delete data.materials[m.id]; save(); paintSheet();
    };
    sh.appendChild(rm);
  });
  var addm=el("button","btn bare","+ add material"); addm.type="button";
  addm.onclick=function(){ var id=uid(); data.materials[id]={id:id,name:"new material",perGram:"0",updatedAt:now()}; save(); paintSheet() };
  sh.appendChild(addm);

  sh.appendChild(el("div","field")).appendChild(el("span",null,"client overrides"));
  sh.appendChild(el("div","khint","Leave blank to use the defaults above."));
  liveClients().forEach(function(c){
    var o=data.clientRates[c.id]||(data.clientRates[c.id]={id:c.id,machine:"",markup:"",updatedAt:now()});
    var row=el("div","two");
    var stamp=function(){ o.updatedAt=now() };
    var a=bindNum(row,c.name+" · machine $/h",o,"machine",stamp); a.placeholder=data.rates.machine;
    var b=bindNum(row,"markup %",o,"markup",stamp); b.placeholder=data.rates.markup;
    sh.appendChild(row);
  });
  var btns=el("div","btns"), done=el("button","btn solid grow","done"); done.type="button"; done.onclick=closeSheet;
  btns.appendChild(done); sh.appendChild(btns);
}

/* ---------- billing ---------- */
function billables(cid){
  return jobsList().filter(function(j){return j.clientId===cid&&!j.invoiceId}).map(function(j){
    return {key:"prints:"+j.id, label:"3D print · "+jobLine(j)+" · "+dateWords(j.date), amount:num(j.price),
      item:{desc:"3D print — "+jobLine(j)+(j.material?" ("+num(j.grams)+" g "+j.material+")":""),
            qty:"1",unit:"",rate:String(num(j.price)),source:"print",date:j.date,ref:"prints:"+j.id},
      bill:function(invoiceId){ var x=D().jobs[j.id]; if(x){ x.invoiceId=invoiceId; x.updatedAt=now() } }};
  });
}
function onVoid(inv){
  var js=D().jobs;
  for(var id in js) if(js[id].invoiceId===inv.id){ delete js[id].invoiceId; js[id].updatedAt=now() }
}

registerModule({
  id:"prints",
  tab:{key:"prints",label:"prints"},
  render:render,
  sheets:{print:sheetPrint, printrates:sheetRates},
  billables:billables,
  onVoid:onVoid
});
})();
