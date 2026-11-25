"use strict";
/* Invoices tab, invoice documents, and the document viewer. */

/* ---------- render: invoices ---------- */
function renderInvoices(){
  var host=$("#invList");host.innerHTML="";
  var list=Object.keys(S.invoices).map(function(k){return S.invoices[k]})
    .sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0)});
  if(!list.length){
    host.appendChild(el("div","empty","No invoices yet. Select blocks on the blocks tab, then Invoice."));
    return;
  }
  var log=el("div","log");
  list.forEach(function(iv){
    var row=el("div","row"),body=el("div","body"),l1=el("div","l1");
    l1.appendChild(el("span",null,iv.number||"(no number)"));
    l1.appendChild(el("span","hrs",money(iv.total||0)));
    body.appendChild(l1);
    body.appendChild(el("div","place",
      (S.clients[iv.clientId]?S.clients[iv.clientId].name:"—")+" \u00b7 "+
      (iv.hours||0).toFixed(2)+" h \u00b7 issued "+dateWords(iv.issued)));
    row.appendChild(body);
    row.onclick=function(){ openInvoice(iv) };
    row.tabIndex=0;
    row.onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();openInvoice(iv)}};
    log.appendChild(row);
  });
  host.appendChild(log);
}
function openInvoice(iv){
  var blocks=(iv.blockIds||[]).map(function(id){
    for(var k in S.months) if(S.months[k][id]) return S.months[k][id];
    return null}).filter(Boolean);
  if(!blocks.length){toast("the blocks for this invoice are gone");return}
  showViewer(iv,S.clients[iv.clientId]||{name:"client"},blocks,false);
}

/* ---------------------------------------------------------
   The invoice is a facsimile of the log: day headers, block
   times, the notes as written, then the arithmetic. One CSS
   string serves both the in-app viewer and the saved file.
   --------------------------------------------------------- */
function docCss(){return [
".invsheet{max-width:760px;margin:0 auto;background:#fff;color:#111;border:1px solid #ddd;",
"  padding:40px 38px;font:13px/1.6 ui-monospace,'Cascadia Mono','Segoe UI Mono',Menlo,Consolas,monospace;",
"  font-variant-numeric:tabular-nums}",
"@media screen{.invsheet{min-height:900px;margin:16px auto 40px}}",
".invsheet header{display:flex;justify-content:space-between;gap:28px;align-items:flex-start;",
"  border-bottom:1px solid #111;padding-bottom:14px;background:transparent;color:#111;",
"  position:static;z-index:auto;padding-top:0}",
".invsheet,.invsheet *{text-transform:none}",
".invsheet .biz,.invsheet .tag h1,.invsheet .parties h2,.invsheet .period{",
"  text-transform:uppercase}",
".invsheet .biz{font-size:15px;font-weight:600;margin:0 0 4px;text-transform:uppercase;letter-spacing:.1em}",
".invsheet .small{font-size:11px;color:#666;white-space:pre-line;line-height:1.5}",
".invsheet .tag{text-align:right;flex:none}",
".invsheet .tag h1{margin:0 0 3px;font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;",
"  color:#666;font-weight:400}",
".invsheet .tag .no{font-size:14px;font-weight:600}",
".invsheet .parties{margin:20px 0 0}",
".invsheet .parties h2{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#999;",
"  margin:0 0 4px;font-weight:400}",
".invsheet .period{margin-top:16px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#666;",
"  text-transform:uppercase;letter-spacing:.08em}",
".invsheet .ilog{margin-top:6px}",
".invsheet .day{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #ccc;",
"  padding:14px 0 4px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#666}",
".invsheet .blk{padding:8px 0 9px;border-bottom:1px solid #f0f0f0}",
".invsheet .blk .l1{display:flex;justify-content:space-between;gap:10px;align-items:baseline}",
".invsheet .blk .tm{color:#333}",
".invsheet .blk .pl{color:#999;font-size:11px;flex:1;padding-left:10px}",
".invsheet .blk .hh{flex:none}",
".invsheet .blk ul{margin:4px 0 0;padding:0 0 0 2ch;list-style:none}",
".invsheet .blk li{position:relative;padding-left:1.2ch;",
"  font-size:11px;color:#666;line-height:1.5}",
".invsheet .blk li:before{content:'·';position:absolute;left:0;color:#bbb}",
".invsheet .blk .nn{margin-left:2ch;color:#bbb;font-size:11px}",
".invsheet .totals{margin-top:20px;display:flex;justify-content:flex-end}",
".invsheet .totals table{border-collapse:collapse;min-width:260px}",
".invsheet .totals td{padding:5px 0 5px 18px;text-align:right}",
".invsheet .totals td:first-child{text-align:left;padding-left:0;color:#666}",
".invsheet .totals .grand td{border-top:1px solid #111;font-size:15px;font-weight:600;padding-top:9px;color:#111}",
".invsheet .memo{margin-top:24px;border-top:1px solid #eee;padding-top:12px;font-size:11.5px;",
"  color:#444;white-space:pre-line}",
".invsheet .pv{background:#111;color:#fff;text-align:center;padding:5px;margin:-40px -38px 26px;",
"  font-size:10.5px;letter-spacing:.22em;text-transform:uppercase}",
".invsheet .qtitle{font-size:14px;font-weight:600;margin:18px 0 0}",
".invsheet .qtab{width:100%;border-collapse:collapse;margin-top:8px}",
".invsheet .qtab th{text-align:left;font-size:10px;letter-spacing:.14em;text-transform:uppercase;",
"  color:#999;font-weight:400;border-bottom:1px solid #ccc;padding:0 0 5px}",
".invsheet .qtab th.n,.invsheet .qtab td.n{text-align:right;white-space:nowrap;padding-left:16px}",
".invsheet .qtab td{padding:9px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;font-size:12.5px}",
".invsheet .qtab td .u{color:#999;font-size:11px}",
".invsheet .qscope{margin:8px 0 0;padding:0;list-style:none}",
".invsheet .qscope li{position:relative;padding:3px 0 3px 1.6ch;font-size:12.5px}",
".invsheet .qscope li:before{content:'\\00b7';position:absolute;left:0;color:#aaa}",
".invsheet .qsec{margin-top:22px}",
".invsheet .qsec h2{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#999;",
"  margin:0 0 5px;font-weight:400}",
".invsheet .qsec .bd{font-size:11.5px;color:#444;white-space:pre-line}",
".invsheet .qsec ul{margin:0;padding:0;list-style:none}",
".invsheet .qsec li{position:relative;padding:2px 0 2px 1.6ch;font-size:11.5px;color:#444}",
".invsheet .qsec li:before{content:'\\00b7';position:absolute;left:0;color:#bbb}"
].join("\n")}

function rateGroups(list){
  var g={};
  list.forEach(function(b){
    var r=rateFor(b),k=String(r);
    if(!g[k])g[k]={rate:r,h:0,a:0};
    g[k].h+=roundHours(rawHours(b)); g[k].a+=amountFor(b);
  });
  return Object.keys(g).map(function(k){return g[k]}).sort(function(x,y){return y.rate-x.rate});
}

function docBody(doc,client,list,preview){
  var sorted=list.slice().sort(function(a,b){return a.start-b.start});
  var biz=S.business,rep=doc.report,fill=doc.desc||"";
  var cur=S.settings.currency||"$";
  function m(n){return cur+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
  function bullets(tasks){
    if(!tasks||!tasks.length) return fill?'<div class="nn">'+esc(fill)+'</div>':'<div class="nn">&mdash;</div>';
    return "<ul>"+tasks.map(function(t){return "<li>"+esc(t.t)+"</li>"}).join("")+"</ul>";
  }
  function blockRow(tm,pl,h,body){
    return '<div class="blk"><div class="l1"><span class="tm">'+esc(tm)+'</span>'+
      '<span class="pl">'+esc(pl)+'</span><span class="hh">'+h.toFixed(2)+'</span></div>'+body+'</div>';
  }

  /* group into days, exactly as the app's log does */
  var days=[],byDay={};
  sorted.forEach(function(b){var k=ymd(b.start);
    if(!byDay[k]){byDay[k]={k:k,label:dlong(b.start),blocks:[],h:0};days.push(byDay[k])}
    byDay[k].blocks.push(b); byDay[k].h+=roundHours(rawHours(b))});

  var logHtml="";
  if(doc.mode==="total"){
    var th=sorted.reduce(function(s2,b){return s2+roundHours(rawHours(b))},0);
    logHtml='<div class="day"><span>'+esc(dlong(sorted[0].start))+' &ndash; '+
      esc(dlong(sorted[sorted.length-1].start))+'</span><span>'+th.toFixed(2)+'</span></div>'+
      blockRow("",""
        ,th,fill?'<div class="nn">'+esc(fill)+'</div>':"");
  }else if(doc.mode==="day"){
    logHtml=days.map(function(d){
      var tasks=[];d.blocks.forEach(function(b){tasks=tasks.concat(b.tasks||[])});
      var pl={};d.blocks.forEach(function(b){pl[placeLabel(b.place).toLowerCase()]=1});
      var tms=d.blocks.map(function(b){return t12(b.start)+"–"+t12(b.end)}).join(", ");
      return '<div class="day"><span>'+esc(d.label)+'</span><span>'+d.h.toFixed(2)+'</span></div>'+
        blockRow(tms,Object.keys(pl).join(" / "),d.h,bullets(tasks));
    }).join("");
  }else{
    logHtml=days.map(function(d){
      return '<div class="day"><span>'+esc(d.label)+'</span><span>'+d.h.toFixed(2)+'</span></div>'+
        d.blocks.map(function(b){
          return blockRow(t12(b.start)+"–"+t12(b.end),placeLabel(b.place).toLowerCase(),
            roundHours(rawHours(b)),bullets(b.tasks));
        }).join("");
    }).join("");
  }

  var onsite=sorted.filter(function(b){return b.place!=="remote"}).length;
  var remote=sorted.length-onsite;
  var groups=rateGroups(sorted);
  var totals="";
  if(rep){
    totals='<tr class="grand"><td>Hours</td><td>'+doc.hours.toFixed(2)+'</td></tr>';
  }else if(groups.length===1&&groups[0].rate){
    totals='<tr><td>Hours</td><td>'+doc.hours.toFixed(2)+'</td></tr>'+
           '<tr><td>Rate</td><td>'+m(groups[0].rate)+' / h</td></tr>'+
           '<tr class="grand"><td>Total due</td><td>'+m(doc.total)+'</td></tr>';
  }else{
    totals=groups.map(function(g){
      return '<tr><td>'+g.h.toFixed(2)+' h at '+(g.rate?m(g.rate):"no rate")+'</td><td>'+
        m(Math.round(g.a*100)/100)+'</td></tr>'}).join("")+
      '<tr class="grand"><td>Total due</td><td>'+m(doc.total)+'</td></tr>';
  }

  return (preview?'<div class="pv">Preview &mdash; nothing saved</div>':"")+
  '<header><div><p class="biz">'+esc(biz.name||"")+'</p><div class="small">'+
  esc(biz.address||"")+(biz.email?"\n"+esc(biz.email):"")+(biz.phone?"\n"+esc(biz.phone):"")+
  '</div></div><div class="tag"><h1>'+(rep?"Work report":"Invoice")+'</h1>'+
  (rep?"":'<div class="no">'+esc(doc.number||"")+'</div>')+
  '<div class="small">'+(rep?"As of ":"Issued ")+esc(dateWords(doc.issued))+
  (doc.due&&!rep?"\nDue "+esc(dateWords(doc.due)):"")+'</div></div></header>'+
  '<div class="parties"><h2>'+(rep?"Prepared for":"Bill to")+'</h2>'+
  '<div style="font-size:13px">'+esc(client.name||"")+'</div><div class="small">'+
  esc(client.address||"")+(client.email?"\n"+esc(client.email):"")+'</div></div>'+
  '<div class="period">'+esc(dlong(sorted[0].start))+' &ndash; '+esc(dlong(sorted[sorted.length-1].start))+
  '  ·  '+sorted.length+' blocks  ·  '+doc.hours.toFixed(2)+' h  ·  '+
  (onsite&&remote?onsite+' on-site, '+remote+' remote':(remote?'all remote':'all on-site'))+'</div>'+
  '<div class="ilog">'+logHtml+'</div>'+
  '<div class="totals"><table>'+totals+'</table></div>'+
  ((doc.memo||(biz.terms&&!rep))?'<div class="memo">'+esc(doc.memo||"")+
    (doc.memo&&biz.terms&&!rep?"\n\n":"")+esc(rep?"":(biz.terms||""))+'</div>':"");
}

function bodyFor(doc,client,list,preview){
  if(doc.quote){ var qb=hook("quoteBody"); return qb?qb(doc,client,preview):"" }
  return docBody(doc,client,list,preview);
}
function titleFor(doc,client){
  if(doc.quote) return "Quote "+(doc.number||"");
  return doc.report?"Work report":("Invoice "+(doc.number||""));
}

function docFile(doc,client,list){
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">\n'+
  '<title>'+esc(titleFor(doc,client))+' — '+esc(client.name||"")+'</title>\n'+
  '<style>\n@page{margin:16mm 14mm}\nhtml{background:#eeedea}\nbody{margin:0;padding:24px 16px}\n'+
  docCss()+'\n@media print{html,body{background:#fff;padding:0}'+
  '.invsheet{border:0;padding:0;max-width:none;min-height:0;margin:0}}\n</style></head><body>'+
  '<div class="invsheet">'+bodyFor(doc,client,list,false)+'</div></body></html>';
}

/* ---------- the viewer: a light document inside the dark app ---------- */
var viewerState=null;
function showViewer(doc,client,list,preview){
  viewerState={doc:doc,client:client,list:list,preview:preview};
  var v=$("#viewer"); v.innerHTML="";
  var bar=el("div","vbar");
  var close=el("button","btn","close");close.type="button";
  close.onclick=hideViewer;
  bar.appendChild(close);
  var pr=el("button","btn solid","print / pdf");pr.type="button";
  pr.onclick=function(){ try{window.print()}catch(e){toast("printing isn't available here")} };
  bar.appendChild(pr);
  var lastBtn=null;
  if(!preview&&!doc.quote&&doc.id&&S.invoices[doc.id]){
    var vd=el("button","btn","void");vd.type="button";
    vd.onclick=function(){
      if(!vd.dataset.armed){vd.dataset.armed="1";vd.textContent="void — tap again";return}
      (doc.blockIds||[]).forEach(function(id){
        for(var k in S.months) if(S.months[k][id]){
          var b=S.months[k][id];
          if(b.invoiceId===doc.id){delete b.invoiceId;b.invoiced=false;b.updatedAt=now()}
        }});
      delete S.invoices[doc.id];
      save();hideViewer();renderAll();
      toast("voided — those blocks are un-invoiced again")};
    bar.appendChild(vd);
  }
  /* modules may add their own buttons here; one returned is placed last */
  var vb=hook("viewerButtons");
  if(vb) lastBtn=vb(doc,bar,preview)||null;
  if(!preview){
    var sv=el("button","btn","save file");sv.type="button";
    sv.onclick=function(){
      var dir=doc.quote?(S.settings.quoteDir||"Radicchio Quotes"):(S.settings.invoiceDir||"Radicchio Invoices");
      var name=safeName((doc.number||(doc.quote?"quote":"invoice"))+" "+client.name);
      deliver([safeName(dir),safeName(client.name),name+".html"],
        docFile(doc,client,list),"text/html;charset=utf-8",
        [doc.quote?"Quotes":"Invoices",safeName(client.name),name+".html"])};
    bar.appendChild(sv);
  }
  if(lastBtn) bar.appendChild(lastBtn);
  v.appendChild(bar);
  var sheet=el("div","invsheet");
  sheet.innerHTML=bodyFor(doc,client,list,preview);
  v.appendChild(sheet);
  v.classList.add("on");
  document.body.style.overflow="hidden";
  v.scrollTop=0;
}
function hideViewer(){
  $("#viewer").classList.remove("on");
  $("#viewer").innerHTML="";
  document.body.style.overflow="";
  viewerState=null;
}
