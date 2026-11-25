/* Time module: the track and blocks tabs, the clock, entries, the plain-text
   log parser, and invoices built from time blocks. */
(function(){
"use strict";
if(!moduleOn("time")) return;

/* =========================================================
   Plain-text log parser. Accepts the shape Eamon already
   writes in Keep, e.g.
     Wed 9/2 in at 530a, out at 630a, in at 1015a, out at 115p
   Leading [ ] / [x] checkboxes are ignored.
   ========================================================= */
function parseClock(tok){
  var m=/^(\d{1,2})[:.]?(\d{2})?\s*(am|pm|a|p)?$/i.exec(String(tok).trim());
  if(!m) return null;
  var h=+m[1], mi=m[2]?+m[2]:0, ap=(m[3]||"").toLowerCase().charAt(0);
  if(h>23||mi>59) return null;
  if(ap==="p"){ if(h<12) h+=12; }
  else if(ap==="a"){ if(h===12) h=0; }
  else if(h>=1&&h<=6){ h+=12; }        // "in at 2, out at 3" means afternoon
  return h*60+mi;
}
function parseDate(line,ref){
  var m=/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/.exec(line);
  if(!m) return null;
  var mo=+m[1], da=+m[2], yr;
  if(m[3]){ yr=+m[3]; if(yr<100) yr+=2000; }
  else{
    yr=new Date(ref).getFullYear();
    if(new Date(yr,mo-1,da).getTime()-ref>180*864e5) yr--;
  }
  var d=new Date(yr,mo-1,da);
  if(d.getMonth()!==mo-1||d.getDate()!==da) return null;
  return d.getTime();
}
function parseLog(text,ref){
  var out=[],bad=[];
  String(text).split(/\r?\n/).forEach(function(raw){
    var line=raw.replace(/^\s*\[.?\]\s*/,"").trim();
    if(!line) return;
    var day=parseDate(line,ref);
    if(day==null){ bad.push(raw.trim()); return; }
    var re=/\b(in|out)\b(?:\s+at)?\s*[:\-]?\s*(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm|a|p)?)/gi, m, seq=[];
    while((m=re.exec(line))){
      var mins=parseClock(m[2]);
      if(mins!=null) seq.push([m[1].toLowerCase(),mins]);
    }
    if(!seq.length){ bad.push(raw.trim()); return; }
    for(var i=0;i<seq.length-1;i++){
      if(seq[i][0]!=="in"||seq[i+1][0]!=="out") continue;
      var s=day+seq[i][1]*60000, e=day+seq[i+1][1]*60000;
      if(e<=s) e+=864e5;
      out.push({start:s,end:e});
      i++;
    }
  });
  return {blocks:out,bad:bad};
}

/* ---------- render: track ---------- */
var ticker=null;
function renderTrack(){
  var cs=liveClients(),sc=$("#selClient");
  var cur=S.active?S.active.clientId:(sc.value||(cs[0]&&cs[0].id)||"");
  sc.innerHTML="";
  if(!cs.length){var o=el("option",null,"none yet — add one in setup");o.value="";sc.appendChild(o)}
  cs.forEach(function(c){var x=el("option",null,c.name);x.value=c.id;sc.appendChild(x)});
  if(cur&&sc.querySelector('option[value="'+cur+'"]'))sc.value=cur;

  var running=!!S.active,btn=$("#clockBtn");
  btn.textContent=running?"clock out":"clock in";
  btn.className="bigbtn"+(running?" running":"");
  btn.disabled=!running&&!sc.value;
  $("#elapsed").classList.toggle("idle",!running);
  sc.disabled=running;

  var lw=$("#liveWrap"); lw.innerHTML="";
  if(running){
    $("#status").textContent="running since "+t12(S.active.start)+" · "+placeLabel(S.active.place).toLowerCase()+
      (cs.length>1?" · "+clientName(S.active.clientId):"");
    if(!ticker)ticker=setInterval(tick,1000);
    tick();
    var live=el("div","live"),lh=el("div","lh");
    lh.appendChild(el("span","cap","working on"));
    var add=el("button","btn bare","+ add"); add.style.padding="0"; add.style.fontSize="12px";
    add.onclick=function(){ openSheet({kind:"live"}) };
    lh.appendChild(add); live.appendChild(lh);
    if(!S.active.tasks.length) live.appendChild(el("div","none","nothing noted yet"));
    else{
      var ul=el("ul");
      S.active.tasks.forEach(function(t){
        var li=el("li"); li.appendChild(el("span",null,"·")); li.appendChild(el("span",null,t.t)); ul.appendChild(li);
      });
      live.appendChild(ul);
    }
    lw.appendChild(live);
  }else{
    if(ticker){clearInterval(ticker);ticker=null}
    $("#elapsed").textContent="0:00:00";
    $("#status").textContent=cs.length?"stopped":"add a client in setup to begin";
  }

  var t0=startOfDay(now()),w0=startOfWeek(now()),th=0,wh=0,val=0;
  allEntries().forEach(function(b){ if(isInvoiced(b))return;
    var h=roundHours(rawHours(b));
    if(b.start>=t0)th+=h; if(b.start>=w0)wh+=h; val+=h*rateFor(b);
  });
  var t=$("#tally"); t.innerHTML="";
  [["today",fmtH(th)],["week",fmtH(wh)],["uninvoiced",money(Math.round(val*100)/100)]].forEach(function(p){
    var s=el("span"); s.appendChild(document.createTextNode(p[0]+" ")); s.appendChild(el("b",null,p[1])); t.appendChild(s);
  });

  /* Track is the working screen: it shows what is still outstanding.
     Invoiced blocks are done with and live on the blocks and invoices tabs. */
  var open=allEntries().filter(function(b){return !isInvoiced(b)});
  var rec=open.slice(0,8),host=$("#recent"); host.innerHTML="";
  if(rec.length) host.appendChild(logList(rec,false));
  else host.appendChild(el("div","empty",allEntries().length
    ? "nothing un-invoiced — every block is billed"
    : "nothing logged yet"));
}
function tick(){if(S.active)$("#elapsed").textContent=hhmmss(now()-S.active.start)}

/* ---------- render: log ---------- */
var selected={};
function logList(list,selectable){
  var host=el("div","log"),lastDay=null,multi=liveClients().length>1;
  if(!list.length){host.appendChild(el("div","empty","no blocks in this range"));return host}
  list.forEach(function(b){
    var day=ymd(b.start);
    if(day!==lastDay){
      lastDay=day;
      var tot=list.filter(function(x){return ymd(x.start)===day})
        .reduce(function(s,x){return s+roundHours(rawHours(x))},0);
      var bar=el("div","day");
      bar.appendChild(el("span",null,dlongKey(day)));
      bar.appendChild(el("span",null,fmtH(tot)));
      host.appendChild(bar);
    }
    var row=el("div","row"+(selectable&&selected[b.id]?" on":""));
    if(selectable){
      var box=el("span","box",selected[b.id]?"[x]":"[ ]");
      box.setAttribute("role","checkbox");
      box.setAttribute("aria-checked",selected[b.id]?"true":"false");
      box.onclick=function(e){e.stopPropagation();
        if(selected[b.id])delete selected[b.id];else selected[b.id]=true; renderBlocks()};
      row.appendChild(box);
    }
    var body=el("div","body"),l1=el("div","l1");
    l1.appendChild(el("span","time",t12(b.start)+"-"+t12(b.end)));
    l1.appendChild(el("span","hrs",fmtH(roundHours(rawHours(b)))));
    body.appendChild(l1);
    var pl=placeLabel(b.place).toLowerCase();
    if(multi) pl+=" · "+clientName(b.clientId);
    if(isInvoiced(b)) pl+=" · "+invoiceLabel(b);
    body.appendChild(el("div","place",pl));
    if((b.tasks||[]).length){
      var ul=el("ul");
      b.tasks.forEach(function(t){
        var li=el("li"); li.appendChild(el("span",null,"·")); li.appendChild(el("span",null,t.t)); ul.appendChild(li);
      });
      body.appendChild(ul);
    }else body.appendChild(el("div","nonote","(no note)"));
    row.appendChild(body);
    row.onclick=function(){openSheet({kind:"entry",id:b.id})};
    row.tabIndex=0;
    row.onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();openSheet({kind:"entry",id:b.id})}};
    host.appendChild(row);
  });
  return host;
}

/* ---------- render: blocks ---------- */
var range={mode:"unbilled",from:null,to:null},filtClient="";
var RANGES=[["today","today"],["week","this week"],["lastweek","last week"],["month","this month"],
            ["lastmonth","last month"],["unbilled","un-invoiced"],["billed","invoiced"],
            ["all","all"],["custom","custom"]];
function rangeBounds(){var n=now();
  switch(range.mode){
    case "today":return[startOfDay(n),n+864e5];
    case "week":return[startOfWeek(n),n+864e5];
    case "lastweek":return[addDays(startOfWeek(n),-7),startOfWeek(n)];
    case "month":return[startOfMonth(n),n+864e5];
    case "lastmonth":var d=new Date(startOfMonth(n));
      return[new Date(d.getFullYear(),d.getMonth()-1,1).getTime(),startOfMonth(n)];
    case "custom":return[range.from||0,(range.to||n)+864e5];
    case "billed":return[0,n+864e5];
    default:return[0,n+864e5];
  }}
function filtered(){var b=rangeBounds();
  return allEntries().filter(function(x){
    if(x.start<b[0]||x.start>=b[1])return false;
    if(range.mode==="unbilled"&&isInvoiced(x))return false;
    if(range.mode==="billed"&&!isInvoiced(x))return false;
    if(filtClient&&x.clientId!==filtClient)return false;
    return true})}
/* What each client is worth in the blocks currently on screen. It follows
   the range and client filters rather than computing its own total, so the
   number always answers "what am I looking at" — which on the default
   un-invoiced range is the same as "what do they owe me". */
function renderTally(list){
  var host=$("#blkTally"); host.innerHTML="";
  if(!list.length) return;
  var by={};
  list.forEach(function(b){
    var t=by[b.clientId]||(by[b.clientId]={h:0,a:0,rated:false});
    t.h+=roundHours(rawHours(b)); t.a+=amountFor(b);
    if(rateFor(b)) t.rated=true;
  });
  var rows=Object.keys(by).map(function(cid){
    return {name:clientName(cid),h:by[cid].h,
            a:Math.round(by[cid].a*100)/100,rated:by[cid].rated}});
  if(rows.length<2 && !rows[0].rated) return;   /* nothing a total would add */
  rows.sort(function(x,y){return y.a-x.a || y.h-x.h});
  rows.forEach(function(r){
    var tr=el("div","tr");
    tr.appendChild(el("span","nm",r.name));
    var v=el("span","vl");
    v.appendChild(el("span","hh",fmtH(r.h)+" h  "));
    v.appendChild(r.rated?el("span",null,money(r.a)):el("span","no","no rate"));
    tr.appendChild(v); host.appendChild(tr);
  });
}
function renderBlocks(){
  var opts=$("#rangeOpts");
  if(!opts.childNodes.length){
    RANGES.forEach(function(r){
      var c=el("button","opt",r[1]);c.type="button";c.dataset.k=r[0];
      c.onclick=function(){range.mode=r[0];
        if(r[0]==="custom"&&range.from==null){range.from=startOfMonth(now());range.to=startOfDay(now())}
        renderBlocks()};
      opts.appendChild(c)});
  }
  Array.prototype.forEach.call(opts.children,function(c){
    c.setAttribute("aria-pressed",c.dataset.k===range.mode?"true":"false")});
  $("#customRange").hidden=range.mode!=="custom";
  if(range.mode==="custom"){
    $("#dFrom").value=range.from?dlong(range.from):"";
    $("#dTo").value=range.to?dlong(range.to):"";
  }
  var cs=liveClients(),fc=$("#filtClient"),prev=filtClient;
  $("#filtField").hidden=cs.length<2;
  fc.innerHTML="";
  var oAll=el("option",null,"all clients");oAll.value="";fc.appendChild(oAll);
  cs.forEach(function(c){var o=el("option",null,c.name);o.value=c.id;fc.appendChild(o)});
  fc.value=prev;

  var list=filtered(),vis={};
  list.forEach(function(b){vis[b.id]=true});
  Object.keys(selected).forEach(function(id){if(!vis[id])delete selected[id]});
  $("#blkCount").textContent=list.length+(list.length===1?" block · ":" blocks · ")+
    fmtH(list.reduce(function(s,b){return s+roundHours(rawHours(b))},0))+" h";
  renderTally(list);
  var host=$("#blockList");host.innerHTML="";host.appendChild(logList(list,true));

  var ids=Object.keys(selected),bar=$("#bar");bar.hidden=!ids.length;
  if(ids.length){
    var sel=list.filter(function(b){return selected[b.id]});
    var h=sel.reduce(function(s,b){return s+roundHours(rawHours(b))},0);
    var amt=sel.reduce(function(s,b){return s+amountFor(b)},0);
    $("#tallyLeft").textContent=ids.length+" selected";
    $("#tallyRight").textContent=fmtH(h)+" h · "+money(Math.round(amt*100)/100);
    $("#btnMark").textContent=sel.every(isInvoiced)?"clear invoiced":"mark invoiced";
  }
}

/* --- the running block: same sheet at clock-in and any time after --- */
function sheetLive(sh,d){
  head(sh,d.first?"clocking in":"working on");
  sh.appendChild(el("div","note",d.first
    ? "Jot what you're setting out to do — you can add lines any time, and again when you clock out."
    : "Running "+hhmmss(now()-S.active.start)+"."));
  var lbl=el("div","field");lbl.appendChild(el("span",null,"location"));
  lbl.appendChild(segmented(S.active.place,function(v){S.active.place=v;save();renderTrack()}));
  sh.appendChild(lbl);
  /* Same calendar as everywhere else, open by default: you rarely notice
     you are late to the clock until after you have pressed it. */
  sh.appendChild(el("div","field")).appendChild(el("span",null,"when this started"));
  var startCal=calendar({start:S.active.start,end:S.active.start,single:true,
    onChange:function(st){
      if(st!==S.active.start){ S.active.start=st; save(); renderTrack(); }
    }});
  sh.appendChild(startCal.node);
  sh.appendChild(el("div","field")).appendChild(el("span",null,"notes"));
  keepList(sh,function(){return S.active.tasks},
    function(l){S.active.tasks=l;save();renderTrack()},
    {autofocus:true,placeholder:d.first?"what you're working on":"what you moved on to"});
  sh.appendChild(el("div","khint","Enter starts a new line. Backspace on an empty line removes it."));
  var btns=el("div","btns");
  var ok=el("button","btn solid grow","done");ok.type="button";
  ok.onclick=function(){closeSheet();renderTrack()};
  btns.appendChild(ok); sh.appendChild(btns);
}

/* --- clock-out prompt --- */
function sheetStop(sh,d){
  d.locked=true;
  head(sh,"what did you work on?",false);
  var cur=[S.active.start, d.end];
  if(d.draft.s!=null&&d.draft.e!=null) cur=[d.draft.s,d.draft.e];
  var lbl=el("div","field");lbl.appendChild(el("span",null,"location"));
  lbl.appendChild(segmented(S.active.place,function(v){S.active.place=v;save()}));
  sh.appendChild(lbl);
  /* Open, not behind a toggle: forgetting to stop on time is the common
     case, so the correction should be the first thing in reach. */
  sh.appendChild(el("div","field")).appendChild(el("span",null,"times"));
  var cal=calendar({start:cur[0],end:cur[1],onChange:function(s2,e2){
    cur=[s2,e2];d.draft.s=s2;d.draft.e=e2;touch()}});
  sh.appendChild(cal.node);

  sh.appendChild(el("div","field")).appendChild(el("span",null,"worked on"));
  var kl=keepList(sh,function(){return S.active.tasks},function(l){S.active.tasks=l;save()},
    {placeholder:"anything else from this block"});
  sh.appendChild(el("div","khint","Enter starts a new line. Backspace on an empty line removes it."));

  var btns=el("div","btns");
  var save1=el("button","btn solid grow","save block");save1.type="button";
  save1.onclick=function(){
    putEntry({id:uid(),clientId:S.active.clientId,start:cur[0],end:cur[1],
      place:S.active.place,tasks:S.active.tasks.slice()});
    S.active=null;save();
    UI.sheet=null;saveUI();closeSheet();renderAll();
    toast(fmtH(roundHours((cur[1]-cur[0])/3600000))+" h logged")};
  btns.appendChild(save1);
  var trash=el("button","btn","discard");trash.type="button";
  trash.onclick=function(){
    if(trash.dataset.armed){S.active=null;save();UI.sheet=null;saveUI();closeSheet();renderAll();toast("discarded");return}
    trash.dataset.armed="1";trash.textContent="discard — tap again"};
  btns.appendChild(trash);
  sh.appendChild(btns);
}

/* --- add / edit an entry --- */
function sheetEntry(sh,d){
  var isNew=!d.id, cs=liveClients();
  var b;
  if(isNew){
    b=d.draft.rec||(d.draft.rec={id:uid(),clientId:(cs[0]||{}).id||"",
      start:now()-3600000,end:now(),place:S.settings.place||"onsite",tasks:[]});
  }else{
    var found=null;
    for(var k in S.months) if(S.months[k][d.id]) found=S.months[k][d.id];
    if(!found){closeSheet();return}
    if(!d.draft.rec) d.draft.rec=JSON.parse(JSON.stringify(Object.assign({},found,{_month:monthKey(found.start)})));
    b=d.draft.rec;
  }
  head(sh,isNew?"add entry":"edit entry");
  var cal=calendar({start:b.start,end:b.end,onChange:function(s,e){b.start=s;b.end=e;touch()}});
  sh.appendChild(cal.node);
  if(cs.length>1){
    var sc=el("select");
    cs.forEach(function(c){var o=el("option",null,c.name);o.value=c.id;sc.appendChild(o)});
    sc.value=b.clientId;
    sc.addEventListener("change",function(){b.clientId=sc.value;touch()});
    fieldOf(sh,"client",sc);
  }
  var lbl=el("div","field");lbl.appendChild(el("span",null,"location"));
  lbl.appendChild(segmented(b.place,function(v){b.place=v;touch()}));
  sh.appendChild(lbl);

  var ivf=el("div","field");ivf.appendChild(el("span",null,"billing"));
  var ivb=el("button","btn",""); ivb.type="button"; ivb.style.width="100%";
  function paintIv(){ivb.textContent=isInvoiced(b)?(invoiceLabel(b)+" — tap to clear"):"not invoiced — tap to mark invoiced"}
  ivb.onclick=function(){ if(isInvoiced(b)){b.invoiced=false;delete b.invoiceId} else b.invoiced=true;
    touch();paintIv()};
  paintIv();ivf.appendChild(ivb);sh.appendChild(ivf);

  sh.appendChild(el("div","field")).appendChild(el("span",null,"worked on"));
  keepList(sh,function(){return b.tasks||[]},function(l){b.tasks=l;touch()},
    {placeholder:"add a line"});
  sh.appendChild(el("div","khint","Enter starts a new line. Backspace on an empty line removes it."));

  var btns=el("div","btns");
  var sv=el("button","btn solid grow","save");sv.type="button";
  sv.onclick=function(){
    if(!b.clientId){toast("add a client first");return}
    putEntry(b);UI.sheet=null;saveUI();closeSheet();renderAll();toast(isNew?"entry added":"entry saved")};
  btns.appendChild(sv);
  if(!isNew){
    var del=el("button","btn","delete");del.type="button";
    del.onclick=function(){
      if(del.dataset.armed){delEntry(b);delete selected[b.id];UI.sheet=null;saveUI();closeSheet();renderAll();toast("entry deleted");return}
      del.dataset.armed="1";del.textContent="delete — tap again"};
    btns.appendChild(del);
  }
  sh.appendChild(btns);
}

/* --- paste in a plain-text log, or a JSON backup --- */
function sheetPaste(sh,d){
  head(sh,"paste data");
  sh.appendChild(el("div","note","Paste a JSON backup, or lines the way you'd jot them: "+
    "\u201cWed 9/2 in at 530a, out at 630a, in at 1015a, out at 115p\u201d. One day per line."));
  var cs=liveClients();
  var sc=el("select");
  cs.forEach(function(c){var o=el("option",null,c.name);o.value=c.id;sc.appendChild(o)});
  sc.value=d.draft.cid||(cs[0]||{}).id||"";
  sc.addEventListener("change",function(){d.draft.cid=sc.value;touch();preview()});
  if(cs.length>1) fieldOf(sh,"client",sc);
  var plc=d.draft.place||S.settings.place||"onsite";
  var lbl=el("div","field");lbl.appendChild(el("span",null,"location"));
  lbl.appendChild(segmented(plc,function(v){plc=v;d.draft.place=v;touch()}));
  sh.appendChild(lbl);

  var ta=el("textarea");ta.rows=6;
  fieldOf(sh,"paste here",ta); bindDraft(ta,"text");
  var out=el("div","note"); sh.appendChild(out);
  var found=[];
  function preview(){
    var txt=(ta.value||"").trim();
    found=[];
    out.innerHTML="";
    if(!txt){ out.textContent="Nothing pasted yet."; return }
    if(txt.charAt(0)==="{"){ out.textContent="Looks like a JSON backup — tap import to merge it."; return }
    var r=parseLog(txt,now());
    var dupe=0;
    r.blocks.forEach(function(b){
      var clash=allEntries().some(function(x){
        return x.clientId===sc.value&&x.start===b.start&&x.end===b.end});
      if(clash){dupe++;return}
      found.push(b);
    });
    var ul=el("ul","klist");
    found.slice(0,30).forEach(function(b){
      var li=el("li");li.appendChild(el("span","b","\u00b7"));
      var t=el("span",null,dlong(b.start)+"   "+t12(b.start)+"\u2013"+t12(b.end)+"   "+
        fmtH(roundHours((b.end-b.start)/3600000))+" h");
      t.style.flex="1";li.appendChild(t);ul.appendChild(li);
    });
    out.appendChild(el("div",null,found.length+" block"+(found.length===1?"":"s")+" to add"+
      (dupe?", "+dupe+" already logged (skipped)":"")+
      (r.bad.length?", "+r.bad.length+" line(s) not understood":"")));
    if(found.length) out.appendChild(ul);
    if(r.bad.length) out.appendChild(el("div","khint","not understood: "+r.bad.slice(0,3).join(" / ")));
  }
  ta.addEventListener("input",preview);
  preview();

  var btns=el("div","btns");
  var go=el("button","btn solid grow","import");go.type="button";
  go.onclick=function(){
    var txt=(ta.value||"").trim();
    if(!txt){toast("nothing to import");return}
    if(txt.charAt(0)==="{"){
      try{ mergeBackup(JSON.parse(txt)); }
      catch(e){ toast("that JSON didn't parse"); return }
      UI.sheet=null;saveUI();closeSheet();renderAll();
      toast("imported "+allEntries().length+" entries");return;
    }
    if(!sc.value){toast("add a client first");return}
    if(!found.length){toast("nothing new to add");return}
    found.forEach(function(b){
      putEntry({id:uid(),clientId:sc.value,start:b.start,end:b.end,place:plc,tasks:[]})});
    var n=found.length;
    UI.sheet=null;saveUI();closeSheet();renderAll();
    toast("added "+n+" block"+(n===1?"":"s"));
  };
  btns.appendChild(go);sh.appendChild(btns);
  sh.appendChild(el("div","khint","Blocks come in with no notes \u2014 tap any one to fill them in."));
}

/* --- custom range --- */
function sheetRange(sh,d){
  head(sh,d.which==="from"?"range start":"range end");
  var base=d.which==="from"?(range.from||startOfMonth(now())):(range.to||startOfDay(now()));
  var cal=calendar({start:base,end:base+3600000,times:false});
  sh.appendChild(cal.node);
  var btns=el("div","btns");
  var sv=el("button","btn solid grow","use this date");sv.type="button";
  sv.onclick=function(){var t=cal.read();
    if(d.which==="from")range.from=startOfDay(t[0]);else range.to=startOfDay(t[0]);
    if(range.from&&range.to&&range.from>range.to){var x=range.from;range.from=range.to;range.to=x}
    closeSheet();renderBlocks()};
  btns.appendChild(sv);sh.appendChild(btns);
}

/* ---------- invoice / work report ---------- */
function sheetInvoice(sh,d){
  var list=filtered().filter(function(b){return selected[b.id]});
  if(!list.length){closeSheet();toast("select some entries first");return}
  var cids={};list.forEach(function(b){cids[b.clientId]=true});
  var ids=Object.keys(cids);
  if(ids.length>1){closeSheet();toast("one client at a time — filter by client above");return}
  var client=S.clients[ids[0]]||{name:"client",rate:0};
  var report=d.report;
  var h=list.reduce(function(s,b){return s+roundHours(rawHours(b))},0);
  var amt=list.reduce(function(s,b){return s+amountFor(b)},0);

  head(sh,report?"work report":"generate invoice");
  /* Test mode is the default: look at the document as many times as you
     like without numbering it, filing it, or touching the blocks. */
  var testMode=d.draft.test!==false;
  var tf=el("div","field");tf.appendChild(el("span",null,"mode"));
  var tseg=el("div","seg");
  ["test run",report?"save report":"record it"].forEach(function(label,i){
    var b=el("button",null,label);b.type="button";
    b.setAttribute("aria-pressed",(i===0)===testMode?"true":"false");
    b.onclick=function(){
      testMode=(i===0); d.draft.test=testMode; touch();
      Array.prototype.forEach.call(tseg.children,function(c,j){
        c.setAttribute("aria-pressed",(j===0)===testMode?"true":"false")});
      paintButtons();
    };
    tseg.appendChild(b)});
  tf.appendChild(tseg);sh.appendChild(tf);
  var numIn=null,dateIn,dueIn;
  if(!report){
    numIn=fieldOf(sh,"invoice number",inp("text",nextNumber(client)));
    bindDraft(numIn,"num");
  }
  var two=el("div","two");
  dateIn=inp("date",ymd(now()));
  var l1=el("label","field");l1.appendChild(el("span",null,report?"as of":"issued"));l1.appendChild(dateIn);
  two.appendChild(l1);
  if(!report){
    dueIn=inp("date",ymd(addDays(now(),+S.settings.net||0)));
    var l2=el("label","field");l2.appendChild(el("span",null,"due"));l2.appendChild(dueIn);
    two.appendChild(l2);
  }
  sh.appendChild(two); bindDraft(dateIn,"issued"); if(dueIn)bindDraft(dueIn,"due");

  var mode=el("select");
  [["block","one line per block"],["day","one line per day"],["total","one line, total hours"]]
    .forEach(function(m){var o=el("option",null,m[1]);o.value=m[0];mode.appendChild(o)});
  fieldOf(sh,"line items",mode); bindDraft(mode,"mode");
  var desc=fieldOf(sh,"description",inp("text","",""));bindDraft(desc,"desc");
  sh.appendChild(el("div","note","Used for the total line, and for any block with no note. Left blank, those cells print empty."));
  var memo=el("textarea");memo.rows=2;memo.placeholder="optional note to the client";
  fieldOf(sh,"memo",memo);bindDraft(memo,"memo");

  sh.appendChild(el("div","note",client.name+" · "+list.length+" blocks · "+fmtH(h)+" h"+
    (report?"":" · "+money(Math.round(amt*100)/100))));

  var btns=el("div","btns");
  function paintButtons(){
    btns.innerHTML="";
    if(testMode){
      var pv=el("button","btn solid grow","preview");pv.type="button";
      pv.onclick=function(){var doc=compose();UI.sheet=null;saveUI();closeSheet();
        showViewer(doc,client,list,true)};
      btns.appendChild(pv);
    }else{
      var mk=el("button","btn solid grow",report?"save report":"save invoice");mk.type="button";
      mk.onclick=function(){finish(true)};btns.appendChild(mk);
      if(!report){var mkc=el("button","btn","save .csv");mkc.type="button";
        mkc.onclick=function(){finish(false)};btns.appendChild(mkc)}
    }
    if(hint) hint.textContent=noteFor();
  }
  sh.appendChild(btns);
  function noteFor(){
    if(testMode) return "Test run: opens the document to look at. Nothing is numbered, filed or marked \u2014 come back as often as you like.";
    return report
      ? "A report shows the same blocks and notes without prices, and marks nothing invoiced \u2014 send it mid-job to keep the client current."
      : "Records the invoice, marks these blocks invoiced and advances the number. It stays in the invoices tab, and can be voided there to redo it.";
  }
  var hint=el("div","note",noteFor());
  sh.appendChild(hint);
  paintButtons();

  function compose(){
    return {number:report?"":(numIn?numIn.value.trim():""),clientId:client.id,
      issued:dateIn.value,due:dueIn?dueIn.value:"",memo:memo.value.trim(),
      mode:mode.value,desc:desc.value.trim(),report:report,
      blockIds:list.map(function(b){return b.id}),
      total:Math.round(amt*100)/100,hours:Math.round(h*100)/100};
  }
  function finish(asHtml){
    var doc=compose();
    var base=report
      ? "report "+ymd(now())+" "+safeName(client.name)
      : safeName(doc.number||"invoice")+" "+safeName(client.name);
    var parts=[safeName(S.settings.invoiceDir||"Radicchio Invoices"),
               safeName(client.name),base+(asHtml?".html":".csv")];
    if(asHtml) deliver(parts,docFile(doc,client,list),"text/html;charset=utf-8");
    else deliver(parts,toCsv(list),"text/csv;charset=utf-8");
    if(!report){
      var id=uid();
      doc.id=id; doc.createdAt=now();
      S.invoices[id]=doc;
      advanceNumber(client,doc.number);
      list.forEach(function(b){b.invoiceId=id;putEntry(b)});
      selected={};
    }
    save();UI.sheet=null;saveUI();closeSheet();renderAll();
    showViewer(doc,client,list,false);
  }
}

$("#selClient").addEventListener("change",renderTrack);
$("#clockBtn").addEventListener("click",function(){
  if(S.active){
    var end=now();
    if(end-S.active.start<1000){S.active=null;save();renderAll();toast("too short to record");return}
    openSheet({kind:"stop",end:end});
  }else{
    var c=$("#selClient").value;
    if(!c){toast("add a client in setup first");return}
    S.active={clientId:c,start:now(),place:S.settings.place||"onsite",tasks:[]};
    save();renderTrack();
    openSheet({kind:"live",first:true});
  }});
$("#addManual").addEventListener("click",function(){
  if(!liveClients().length){toast("add a client in setup first");return}
  openSheet({kind:"entry"})});

$("#filtClient").addEventListener("change",function(){filtClient=this.value;renderBlocks()});
$("#dFrom").addEventListener("click",function(){openSheet({kind:"range",which:"from"})});
$("#dTo").addEventListener("click",function(){openSheet({kind:"range",which:"to"})});
$("#selAll").addEventListener("click",function(){filtered().forEach(function(b){selected[b.id]=true});renderBlocks()});
$("#selNone").addEventListener("click",function(){selected={};renderBlocks()});
$("#btnCsv").addEventListener("click",function(){
  var l=filtered().filter(function(b){return selected[b.id]});
  if(!l.length){toast("nothing selected");return}
  deliver(["hours_"+stamp()+".csv"],toCsv(l),"text/csv;charset=utf-8")});
$("#btnMark").addEventListener("click",function(){
  var sel=filtered().filter(function(b){return selected[b.id]});
  if(!sel.length)return;
  var clearing=sel.every(isInvoiced);
  sel.forEach(function(b){
    if(clearing){b.invoiced=false;delete b.invoiceId}else{b.invoiced=true}
    putEntry(b)});
  renderAll();toast(clearing?"marked not invoiced":"marked invoiced")});
$("#btnInv").addEventListener("click",function(){openSheet({kind:"invoice"})});
$("#btnReport").addEventListener("click",function(){openSheet({kind:"invoice",report:true})});

$("#pasteData").addEventListener("click",function(){openSheet({kind:"paste"})});

registerModule({
  id:"time",
  render:function(){renderTrack();renderBlocks()},
  sheets:{entry:sheetEntry,stop:sheetStop,live:sheetLive,invoice:sheetInvoice,
          range:sheetRange,paste:sheetPaste},
  onShow:function(){tick();renderTrack()}
});
})();
