/* Quotes module: the quotes tab, the quote sheet, templates, quote documents. */
(function(){
"use strict";
if(!moduleOn("quotes")) return;

function quoteTotal(qd){
  if(qd.mode==="lump") return Math.round((parseFloat(qd.lump)||0)*100)/100;
  return Math.round((qd.items||[]).reduce(function(a,it){return a+itemAmount(it)},0)*100)/100;
}
function depositAmount(qd){
  var t=quoteTotal(qd), v=parseFloat(qd.depValue);
  if(!isFinite(v)||v<=0) return 0;
  return Math.round((qd.depType==="fixed"?v:t*v/100)*100)/100;
}
function liveQuotes(){
  if(!S.quotes) S.quotes={};
  return Object.keys(S.quotes).map(function(k){return S.quotes[k]})
    .sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0)});
}
var QSTATUS=["draft","sent","accepted","declined"];

/* ---------- the quote sheet ---------- */
function sheetQuote(sh,d){
  var cs=liveClients();
  if(!cs.length){ closeSheet(); toast("add a client in setup first"); return }
  var isNew=!d.id, q;
  if(isNew){
    if(!d.draft.rec){
      var b=d.tpl||{};
      var c0=cs[0]||{};
      d.draft.rec={
        id:uid(), quote:true, clientId:c0.id||"", number:nextQuoteNumber(c0),
        title:b.title||"", mode:b.mode||"items",
        items:(b.items||[]).map(function(it){return {desc:it.desc,qty:it.qty,unit:it.unit,rate:it.rate}}),
        scope:(b.scope||[]).map(function(x){return {t:x.t}}),
        lump:b.lump||"", issued:ymd(now()),
        valid:ymd(addDays(now(),+S.settings.quoteValid||30)),
        depType:b.depType||"pct", depValue:b.depValue||"",
        lead:b.lead||"", exclusions:(b.exclusions||[]).map(function(x){return {t:x.t}}),
        notes:b.notes||"", status:"draft", fromTpl:(d.tpl&&d.tpl.name)||""
      };
      if(!d.draft.rec.items.length) d.draft.rec.items=[{desc:"",qty:"",unit:"",rate:""}];
    }
    q=d.draft.rec;
  }else{
    if(!S.quotes[d.id]){ closeSheet(); return }
    if(!d.draft.rec) d.draft.rec=JSON.parse(JSON.stringify(S.quotes[d.id]));
    q=d.draft.rec;
  }
  head(sh,isNew?"new quote":"edit quote");
  if(q.fromTpl) sh.appendChild(el("div","khint","from template: "+q.fromTpl));

  var sc=el("select");
  cs.forEach(function(c){var o=el("option",null,c.name);o.value=c.id;sc.appendChild(o)});
  sc.value=q.clientId;
  if(cs.length>1) fieldOf(sh,"client",sc);

  var numIn=fieldOf(sh,"quote number",inp("text",q.number||"",""));
  numIn.addEventListener("input",function(){q.number=numIn.value;d.draft.numTouched=true;touch()});
  sc.addEventListener("change",function(){
    q.clientId=sc.value;
    if(isNew&&!d.draft.numTouched){ q.number=nextQuoteNumber(S.clients[sc.value]); numIn.value=q.number; }
    touch();
  });

  var ti=fieldOf(sh,"title",inp("text",q.title||"",""));
  ti.addEventListener("input",function(){q.title=ti.value;touch()});

  var mf=el("div","field");mf.appendChild(el("span",null,"pricing"));
  var mseg=el("div","seg");
  [["items","itemised"],["lump","lump sum"]].forEach(function(o,i){
    var bt=el("button",null,o[1]);bt.type="button";
    bt.setAttribute("aria-pressed",q.mode===o[0]?"true":"false");
    bt.onclick=function(){
      q.mode=o[0];touch();
      Array.prototype.forEach.call(mseg.children,function(x,j){
        x.setAttribute("aria-pressed",(j===i)?"true":"false")});
      paintBody();
    };
    mseg.appendChild(bt);
  });
  mf.appendChild(mseg);sh.appendChild(mf);

  var bodyBox=el("div");sh.appendChild(bodyBox);
  var totLine=el("div","subtot");sh.appendChild(totLine);
  function paintTotal(){
    totLine.innerHTML="";
    var t=quoteTotal(q), dep=depositAmount(q);
    totLine.appendChild(el("span","sc",dep>0?("total \u00b7 deposit "+money(dep)):"total"));
    totLine.appendChild(el("b",null,money(t)));
  }
  function paintBody(){
    bodyBox.innerHTML="";
    if(q.mode==="lump"){
      bodyBox.appendChild(el("div","field")).appendChild(el("span",null,"scope \u2014 what's included"));
      keepList(bodyBox,function(){return q.scope||[]},function(l){q.scope=l;touch();},
        {placeholder:"add a line"});
      bodyBox.appendChild(el("div","khint","Enter starts a new line."));
      var li=el("input");li.type="number";li.step="any";li.setAttribute("inputmode","decimal");
      li.value=q.lump==null?"":q.lump;
      var lw=el("label","field");lw.appendChild(el("span",null,"price"));lw.appendChild(li);
      bodyBox.appendChild(lw);
      li.addEventListener("input",function(){q.lump=li.value;touch();paintTotal()});
    }else{
      bodyBox.appendChild(el("div","field")).appendChild(el("span",null,"line items"));
      itemEditor(bodyBox,function(){return q.items||[]},function(l){q.items=l},paintTotal);
    }
    paintTotal();
  }
  paintBody();

  var two=el("div","two");
  var iss=inp("date",q.issued||ymd(now())), val=inp("date",q.valid||"");
  var l1=el("label","field");l1.appendChild(el("span",null,"issued"));l1.appendChild(iss);
  var l2=el("label","field");l2.appendChild(el("span",null,"valid until"));l2.appendChild(val);
  two.appendChild(l1);two.appendChild(l2);sh.appendChild(two);
  iss.addEventListener("input",function(){q.issued=iss.value;touch()});
  val.addEventListener("input",function(){q.valid=val.value;touch()});

  var df=el("div","field");df.appendChild(el("span",null,"deposit"));
  var dseg=el("div","seg");
  [["pct","percent"],["fixed","fixed amount"]].forEach(function(o,i){
    var bt=el("button",null,o[1]);bt.type="button";
    bt.setAttribute("aria-pressed",(q.depType||"pct")===o[0]?"true":"false");
    bt.onclick=function(){q.depType=o[0];touch();
      Array.prototype.forEach.call(dseg.children,function(x,j){
        x.setAttribute("aria-pressed",(j===i)?"true":"false")});
      paintTotal()};
    dseg.appendChild(bt);
  });
  df.appendChild(dseg);sh.appendChild(df);
  var dv=el("input");dv.type="number";dv.step="any";dv.setAttribute("inputmode","decimal");
  dv.value=q.depValue==null?"":q.depValue;
  var dl=el("label","field");dl.appendChild(el("span",null,"deposit value"));dl.appendChild(dv);
  sh.appendChild(dl);
  dv.addEventListener("input",function(){q.depValue=dv.value;touch();paintTotal()});
  sh.appendChild(el("div","khint","Leave the value blank for no deposit line."));

  var ld=fieldOf(sh,"lead time",inp("text",q.lead||"",""));
  ld.addEventListener("input",function(){q.lead=ld.value;touch()});

  sh.appendChild(el("div","field")).appendChild(el("span",null,"not included"));
  keepList(sh,function(){return q.exclusions||[]},function(l){q.exclusions=l;touch()},
    {placeholder:"add a line"});
  sh.appendChild(el("div","khint","The field that prevents arguments later \u2014 delivery, site measure, changes after sign-off."));

  var nt=el("textarea");nt.rows=3;nt.value=q.notes||"";
  fieldOf(sh,"notes",nt);
  nt.addEventListener("input",function(){q.notes=nt.value;touch()});

  var btns=el("div","btns");
  var pv=el("button","btn grow","preview");pv.type="button";
  pv.onclick=function(){
    var snap=JSON.parse(JSON.stringify(q));
    UI.sheet=null;saveUI();closeSheet();
    showViewer(snap,S.clients[q.clientId]||{name:"client"},[],true)};
  btns.appendChild(pv);
  var sv=el("button","btn solid grow","save");sv.type="button";
  sv.onclick=function(){
    if(!q.clientId){toast("pick a client");return}
    q.number=(numIn.value||"").trim();
    q.updatedAt=now();
    if(isNew){
      q.createdAt=now();
      var c=S.clients[q.clientId];
      if(c) advanceQuoteNumber(c,q.number);
    }
    S.quotes[q.id]=q; save();
    UI.sheet=null;saveUI();closeSheet();renderAll();
    showViewer(S.quotes[q.id],S.clients[q.clientId]||{name:"client"},[],false)};
  btns.appendChild(sv);
  sh.appendChild(btns);

  var btns2=el("div","btns");
  var tpl=el("button","btn grow","save as template");tpl.type="button";
  tpl.onclick=function(){
    var id=uid();
    S.qtemplates[id]={id:id,name:(q.title||"untitled").trim(),mode:q.mode,
      title:q.title||"",items:(q.items||[]).map(function(it){return {desc:it.desc,qty:it.qty,unit:it.unit,rate:it.rate}}),
      scope:(q.scope||[]).map(function(x){return {t:x.t}}),lump:q.lump||"",
      depType:q.depType,depValue:q.depValue,lead:q.lead||"",
      exclusions:(q.exclusions||[]).map(function(x){return {t:x.t}}),notes:q.notes||""};
    save();toast("saved as a template")};
  btns2.appendChild(tpl);
  if(!isNew){
    var del=el("button","btn","delete");del.type="button";
    del.onclick=function(){
      if(!del.dataset.armed){del.dataset.armed="1";del.textContent="delete — tap again";return}
      delete S.quotes[q.id];save();UI.sheet=null;saveUI();closeSheet();renderAll();toast("quote deleted")};
    btns2.appendChild(del);
  }
  sh.appendChild(btns2);
}

/* ---------- templates ---------- */
function sheetTemplates(sh,d){
  head(sh,d.pick?"start from a template":"quote templates");
  if(!S.qtemplates) S.qtemplates={};
  var list=Object.keys(S.qtemplates).map(function(k){return S.qtemplates[k]})
    .sort(function(a,b){return String(a.name||"").localeCompare(String(b.name||""))});
  if(!list.length){
    sh.appendChild(el("div","empty","No templates yet."));
    sh.appendChild(el("div","khint",
      "Build a quote the way you want it, then use \u201csave as template\u201d at the bottom of the quote sheet. "+
      "A template keeps the line items, scope, deposit, lead time and exclusions \u2014 not the client, the number or the dates."));
  }else{
    var log=el("div","log");
    list.forEach(function(t){
      var row=el("div","row"),body=el("div","body"),l1=el("div","l1");
      l1.appendChild(el("span",null,t.name||"(unnamed)"));
      l1.appendChild(el("span","hrs",t.mode==="lump"?"lump sum":((t.items||[]).length+" lines")));
      body.appendChild(l1);
      var hint=el("div","place",d.pick?"tap to use":"tap twice to delete");
      body.appendChild(hint);row.appendChild(body);
      row.onclick=function(){
        if(d.pick){ UI.sheet=null;saveUI();openSheet({kind:"quote",tpl:t}); return }
        if(!row.dataset.armed){row.dataset.armed="1";hint.textContent="tap again to delete";return}
        delete S.qtemplates[t.id];save();paintSheet()};
      row.tabIndex=0;
      log.appendChild(row);
    });
    sh.appendChild(log);
  }
  var btns=el("div","btns");
  var cl=el("button","btn grow","close");cl.type="button";cl.onclick=closeSheet;
  btns.appendChild(cl);sh.appendChild(btns);
}

/* ---------- render: quotes ---------- */
function renderQuotes(){
  var host=$("#quoteList");host.innerHTML="";
  var list=liveQuotes();
  if(!list.length){
    host.appendChild(el("div","empty","No quotes yet. Tap + new quote, or start from a template."));
    return;
  }
  var log=el("div","log");
  list.forEach(function(q){
    var row=el("div","row"),body=el("div","body"),l1=el("div","l1");
    l1.appendChild(el("span",null,q.number||"(no number)"));
    l1.appendChild(el("span","hrs",money(quoteTotal(q))));
    body.appendChild(l1);
    body.appendChild(el("div","place",
      (S.clients[q.clientId]?S.clients[q.clientId].name:"\u2014")+" \u00b7 "+
      (q.status||"draft")+" \u00b7 "+dateWords(q.issued)));
    if(q.title) body.appendChild(el("div","note",q.title));
    row.appendChild(body);
    row.onclick=function(){ showViewer(q,S.clients[q.clientId]||{name:"client"},[],false) };
    row.tabIndex=0;
    row.onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();
      showViewer(q,S.clients[q.clientId]||{name:"client"},[],false)}};
    log.appendChild(row);
  });
  host.appendChild(log);
}

function quoteBody(doc,client,preview){
  var cur=S.settings.currency||"$", biz=S.business;
  function m(n){return cur+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
  var total=quoteTotal(doc), dep=depositAmount(doc);
  var body="";
  if(doc.mode==="lump"){
    var scope=(doc.scope||[]).filter(function(x){return (x.t||"").trim()});
    body=scope.length
      ? '<ul class="qscope">'+scope.map(function(x){return "<li>"+esc(x.t)+"</li>"}).join("")+'</ul>'
      : "";
  }else{
    var rows=(doc.items||[]).filter(function(it){return (it.desc||"").trim()||itemAmount(it)})
      .map(function(it){
        var q=parseFloat(it.qty);
        return '<tr><td>'+esc(it.desc||"")+'</td>'+
          '<td class="n">'+(isFinite(q)?q:"")+(it.unit?' <span class="u">'+esc(it.unit)+'</span>':"")+'</td>'+
          '<td class="n">'+(parseFloat(it.rate)?m(parseFloat(it.rate)):"")+'</td>'+
          '<td class="n">'+m(itemAmount(it))+'</td></tr>';
      }).join("");
    body=rows?'<table class="qtab"><thead><tr><th>Description</th><th class="n">Qty</th>'+
      '<th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>'+rows+'</tbody></table>':"";
  }
  var totals='<tr class="grand"><td>Total</td><td class="n">'+m(total)+'</td></tr>';
  if(dep>0){
    var lbl=doc.depType==="fixed"?"Deposit":("Deposit ("+(parseFloat(doc.depValue)||0)+"%)");
    totals+='<tr><td>'+esc(lbl)+'</td><td class="n">'+m(dep)+'</td></tr>'+
      '<tr><td>Balance on completion</td><td class="n">'+m(Math.round((total-dep)*100)/100)+'</td></tr>';
  }
  function sec(h,inner){ return inner?'<div class="qsec"><h2>'+esc(h)+'</h2>'+inner+'</div>':"" }
  function lines(arr){
    var l=(arr||[]).filter(function(x){return (x.t||"").trim()});
    return l.length?'<ul>'+l.map(function(x){return "<li>"+esc(x.t)+"</li>"}).join("")+'</ul>':"";
  }
  return (preview?'<div class="pv">Preview &mdash; nothing saved</div>':"")+
  '<header><div><p class="biz">'+esc(biz.name||"")+'</p><div class="small">'+
  esc(biz.address||"")+(biz.email?"\n"+esc(biz.email):"")+(biz.phone?"\n"+esc(biz.phone):"")+
  '</div></div><div class="tag"><h1>Quote</h1><div class="no">'+esc(doc.number||"")+'</div>'+
  '<div class="small">Issued '+esc(dateWords(doc.issued))+
  (doc.valid?"\nValid until "+esc(dateWords(doc.valid)):"")+'</div></div></header>'+
  '<div class="parties"><h2>Prepared for</h2><div style="font-size:13px">'+esc(client.name||"")+'</div>'+
  '<div class="small">'+esc(client.address||"")+(client.email?"\n"+esc(client.email):"")+'</div></div>'+
  (doc.title?'<p class="qtitle">'+esc(doc.title)+'</p>':"")+
  body+
  '<div class="totals"><table>'+totals+'</table></div>'+
  sec("Lead time",doc.lead?'<div class="bd">'+esc(doc.lead)+'</div>':"")+
  sec("Not included",lines(doc.exclusions))+
  sec("Notes",doc.notes?'<div class="bd">'+esc(doc.notes)+'</div>':"")+
  (biz.terms?'<div class="memo">'+esc(biz.terms)+'</div>':"");
}

$("#addQuote").addEventListener("click",function(){openSheet({kind:"quote"})});
$("#qFromTpl").addEventListener("click",function(){openSheet({kind:"templates",pick:true})});
$("#manageTpl").addEventListener("click",function(){openSheet({kind:"templates"})});

/* the quote's own buttons in the document viewer; the one returned goes last */
function viewerButtons(doc,bar,preview){
  if(!(!preview&&doc.quote&&doc.id&&S.quotes[doc.id])) return null;
  var ed=el("button","btn","edit");ed.type="button";
  ed.onclick=function(){hideViewer();openSheet({kind:"quote",id:doc.id})};
  bar.appendChild(ed);
  var stb=el("button","btn",doc.status||"draft");stb.type="button";
  stb.onclick=function(){
    var i=QSTATUS.indexOf(doc.status||"draft");
    doc.status=QSTATUS[(i+1)%QSTATUS.length];
    doc.updatedAt=now(); S.quotes[doc.id]=doc; save();
    stb.textContent=doc.status; renderQuotes()};
  bar.appendChild(stb);
  var lastBtn=el("button","btn","delete");lastBtn.type="button";
  lastBtn.onclick=function(){
    if(!lastBtn.dataset.armed){lastBtn.dataset.armed="1";lastBtn.textContent="delete — tap again";return}
    delete S.quotes[doc.id]; save(); hideViewer(); renderAll(); toast("quote deleted")};
  return lastBtn;
}

registerModule({
  id:"quotes",
  render:renderQuotes,
  sheets:{quote:sheetQuote,templates:sheetTemplates},
  quoteBody:quoteBody,
  viewerButtons:viewerButtons
});
})();
