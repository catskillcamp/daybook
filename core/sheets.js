"use strict";
/* The bottom-sheet framework and the shared form pieces: checklist, calendar. */

/* =========================================================
   SHEETS — every sheet is described by a serialisable
   descriptor in UI.sheet, so leaving the app and coming back
   reopens it with whatever was typed still in place.
   ========================================================= */
function openSheet(desc){ UI.sheet=desc; if(!desc.draft)desc.draft={}; saveUI(); paintSheet() }
function closeSheet(){ UI.sheet=null; saveUI(); $("#scrim").hidden=true; $("#sheet").innerHTML="";
  document.body.style.overflow="" }
function draft(){ return UI.sheet.draft }
function touch(){ saveUI() }

function paintSheet(){
  var d=UI.sheet;
  if(!d){ $("#scrim").hidden=true; return }
  var sh=$("#sheet"); sh.innerHTML="";
  var builder=sheetBuilder(d.kind);
  if(!builder){ closeSheet(); return }
  builder(sh,d);
  tuneInputs(sh);
  $("#scrim").hidden=false; document.body.style.overflow="hidden";
}
$("#scrim").addEventListener("click",function(e){
  if(e.target===$("#scrim")&&UI.sheet&&!UI.sheet.locked) closeSheet()});
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"&&UI.sheet&&!UI.sheet.locked) closeSheet()});

function head(sh,title,closable){
  var hd=el("div","hd");hd.appendChild(el("b",null,title));
  if(closable!==false){var x=el("button","btn bare","close");x.onclick=closeSheet;hd.appendChild(x)}
  sh.appendChild(hd)}
function fieldOf(sh,label,node){var f=el("label","field");f.appendChild(el("span",null,label));
  f.appendChild(node);sh.appendChild(f);return node}
function inp(type,val,ph){var i=el("input");i.type=type;if(val!=null)i.value=val;if(ph)i.placeholder=ph;return i}
function bindDraft(node,key){
  node.value=draft()[key]!=null?draft()[key]:node.value;
  node.addEventListener("input",function(){draft()[key]=node.value;touch()});
  node.addEventListener("change",function(){draft()[key]=node.value;touch()});
  return node;
}
function segmented(value,onPick){
  var wrap=el("div","seg");
  [["onsite","on-site"],["remote","remote"]].forEach(function(p){
    var b=el("button",null,p[1]);b.type="button";
    b.setAttribute("aria-pressed",value===p[0]?"true":"false");
    b.onclick=function(){value=p[0];
      Array.prototype.forEach.call(wrap.children,function(c,i){
        c.setAttribute("aria-pressed",(i===0?"onsite":"remote")===value?"true":"false")});
      onPick(value)};
    wrap.appendChild(b)});
  return wrap;
}
/* A Google Keep style checklist: every line is editable in place, Enter
   starts the next one, backspace on an empty line removes it, and there is
   always a blank line waiting at the bottom. Used at clock-in, mid-block,
   clock-out and when editing an entry, so notes are built the same way
   whenever you happen to write them. */
function keepList(sh,getList,setList,opts){
  opts=opts||{};
  var box=el("div"); sh.appendChild(box);
  function commit(list){
    setList(list.filter(function(t){return (t.t||"").trim()!==""})
      .map(function(t){return {t:t.t.trim(),at:t.at||now()}}));
  }
  function paint(focusIdx,caretEnd){
    var list=getList().slice();
    if(!list.length||(list[list.length-1].t||"").trim()!=="") list.push({t:"",at:now()});
    box.innerHTML="";
    var ul=el("ul","klist");
    list.forEach(function(t,i){
      var li=el("li"); if(!t.t) li.className="blank";
      li.dataset.idx=i;
      var grip=el("span","grip","\u2261");
      grip.setAttribute("aria-label","drag to reorder");
      if(t.t) grip.addEventListener("pointerdown",function(e){startDrag(e,grip,li,ul,list)});
      li.appendChild(grip);
      var inp=el("input"); inp.type="text"; inp.value=t.t||"";
      inp.placeholder=i===list.length-1?(opts.placeholder||"add a line"):"";
      inp.setAttribute("enterkeyhint","enter");
      inp.addEventListener("input",function(){
        list[i].t=inp.value; commit(list); touch();
        li.className=inp.value?"":"blank";
        if(i===list.length-1&&inp.value){ // grow a fresh blank line beneath
          var at=inp.selectionStart; paint(i,at);
        }
      });
      inp.addEventListener("keydown",function(e){
        if(e.key==="Enter"){ e.preventDefault();
          list[i].t=inp.value; list.splice(i+1,0,{t:"",at:now()});
          commit(list); touch(); paint(i+1); }
        else if(e.key==="Backspace"&&inp.value===""&&list.length>1&&i>0){
          e.preventDefault(); list.splice(i,1); commit(list); touch(); paint(i-1,true); }
      });
      li.appendChild(inp);
      if(t.t){
        var x=el("button","x","×"); x.type="button"; x.setAttribute("aria-label","remove line");
        x.onclick=function(){ list.splice(i,1); commit(list); touch(); paint(Math.max(0,i-1)); };
        li.appendChild(x);
      }
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if(focusIdx!=null){
      var inputs=box.querySelectorAll("input");
      var n=inputs[Math.min(focusIdx,inputs.length-1)];
      if(n){ try{ n.focus();
        var p=caretEnd===true?n.value.length:(typeof caretEnd==="number"?caretEnd:n.value.length);
        n.setSelectionRange(p,p);
      }catch(e){} }
    }
  }
  /* Drag a line by its handle. The DOM is reordered live; the array is
     rebuilt from the row indexes on release, so duplicate text is safe. */
  /* Keep-style drag. The row under the finger is translated to follow it
     exactly and nothing else moves it; the rows it passes slide one slot
     out of the way on a transition. The DOM order is left alone until
     release, so nothing can be dropped mid-gesture — which is what made
     the earlier hit-test version feel like it was fighting back.
     Listeners live on the document: pointer capture alone is not enough. */
  function startDrag(e,grip,li,ul,list){
    if(e.button&&e.button!==0) return;
    e.preventDefault(); e.stopPropagation();
    var rows=Array.prototype.slice.call(ul.children);
    var from=rows.indexOf(li);
    if(from<0) return;
    var h=li.getBoundingClientRect().height||44;
    /* the trailing blank line is not a slot you can drop into */
    var last=rows.length-1;
    while(last>0 && rows[last].classList.contains("blank")) last--;
    var startY=e.clientY, to=from, moved=false;
    li.classList.add("drag");
    try{grip.setPointerCapture(e.pointerId)}catch(err){}

    function place(){
      rows.forEach(function(r,i){
        if(i===from) return;
        var shift=0;
        if(from<to && i>from && i<=to) shift=-h;
        else if(from>to && i>=to && i<from) shift=h;
        r.style.transform=shift?"translateY("+shift+"px)":"";
      });
    }
    function move(ev){
      if(ev.cancelable) ev.preventDefault();
      var dy=ev.clientY-startY;
      if(!moved && Math.abs(dy)<2) return;
      moved=true;
      li.style.transform="translateY("+dy+"px)";
      var t=Math.max(0,Math.min(last,from+Math.round(dy/h)));
      if(t!==to){ to=t; place(); }
    }
    function up(){
      document.removeEventListener("pointermove",move,{passive:false});
      document.removeEventListener("pointerup",up);
      document.removeEventListener("pointercancel",up);
      try{grip.releasePointerCapture(e.pointerId)}catch(err){}
      rows.forEach(function(r){r.style.transform=""});
      li.classList.remove("drag");
      if(to!==from){
        var order=rows.map(function(r){return +r.dataset.idx});
        var pick=order.splice(from,1)[0];
        order.splice(to,0,pick);
        var next=order.map(function(j){return list[j]})
          .filter(function(t){return t&&(t.t||"").trim()!==""});
        setList(next); touch();
      }
      paint();
    }
    document.addEventListener("pointermove",move,{passive:false});
    document.addEventListener("pointerup",up);
    document.addEventListener("pointercancel",up);
  }
  paint(opts.autofocus?0:null);
  return {focusLast:function(){var i=box.querySelectorAll("input").length-1;paint(i)}};
}

/* ---------- calendar (shared by add, edit, clock-out, range) ---------- */
function calendar(opts){
  var st={start:opts.start,end:opts.end,month:startOfMonth(opts.start)};
  var root=el("div","cal"),head1=el("div","mo");
  var prev=el("button",null,"‹");prev.type="button";prev.setAttribute("aria-label","previous month");
  var label=el("b");
  var next=el("button",null,"›");next.type="button";next.setAttribute("aria-label","next month");
  head1.appendChild(prev);head1.appendChild(label);head1.appendChild(next);root.appendChild(head1);
  var dow=el("div","dow");DOW2.forEach(function(x){dow.appendChild(el("span",null,x))});root.appendChild(dow);
  var grid=el("div","grid");root.appendChild(grid);
  var tS=null,tE=null,sum=null,single=!!opts.single;
  if(opts.times!==false){
    var two=el("div","two");two.style.marginTop="4px";
    tS=el("input");tS.type="time";tS.value=hm24(st.start);
    var l1=el("label","field");l1.appendChild(el("span",null,single?"started at":"start"));
    l1.appendChild(tS);two.appendChild(l1);
    if(!single){
      tE=el("input");tE.type="time";tE.value=hm24(st.end);
      var l2=el("label","field");l2.appendChild(el("span",null,"end"));l2.appendChild(tE);
      two.appendChild(l2);
    }
    root.appendChild(two);
    sum=el("div","sum");root.appendChild(sum);
    [tS,tE].forEach(function(n){if(n)n.addEventListener("input",commit)});
  }
  prev.onclick=function(){var d=new Date(st.month);st.month=new Date(d.getFullYear(),d.getMonth()-1,1).getTime();draw()};
  next.onclick=function(){var d=new Date(st.month);st.month=new Date(d.getFullYear(),d.getMonth()+1,1).getTime();draw()};
  function readTimes(){
    if(!tS)return[st.start,st.end];
    var d=new Date(st.start),a=tS.value.split(":");
    var s=new Date(d.getFullYear(),d.getMonth(),d.getDate(),+a[0]||0,+a[1]||0).getTime();
    if(!tE) return[s,s];
    var z=tE.value.split(":");
    var e=new Date(d.getFullYear(),d.getMonth(),d.getDate(),+z[0]||0,+z[1]||0).getTime();
    if(e<=s)e+=864e5; return[s,e]}
  function commit(){
    var t=readTimes();st.start=t[0];st.end=t[1];
    if(sum){sum.innerHTML="";
      sum.appendChild(el("span",null,dlong(st.start)+
        (!single&&st.end-st.start>=864e5?" → next day":"")));
      var r=el("span");
      if(single){ r.appendChild(el("b",null,t12(st.start))); }
      else{
        r.appendChild(document.createTextNode(t12(st.start)+"–"+t12(st.end)+"  "));
        r.appendChild(el("b",null,fmtH(roundHours((st.end-st.start)/3600000))+" h"));
      }
      sum.appendChild(r)}
    if(opts.onChange)opts.onChange(st.start,st.end)}
  function pick(dayMs){
    var d=new Date(dayMs),s=new Date(st.start),span=st.end-st.start;
    st.start=new Date(d.getFullYear(),d.getMonth(),d.getDate(),s.getHours(),s.getMinutes()).getTime();
    st.end=st.start+span;draw();commit()}
  function draw(){
    var d=new Date(st.month);
    label.textContent=MONS_FULL[d.getMonth()]+" "+d.getFullYear();
    grid.innerHTML="";
    var first=new Date(d.getFullYear(),d.getMonth(),1),lead=(first.getDay()+6)%7;
    var dim=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    var pdim=new Date(d.getFullYear(),d.getMonth(),0).getDate();
    var selK=ymd(st.start),todayK=ymd(now()),cells=[],i;
    for(i=lead-1;i>=0;i--)cells.push([new Date(d.getFullYear(),d.getMonth()-1,pdim-i).getTime(),true]);
    for(i=1;i<=dim;i++)cells.push([new Date(d.getFullYear(),d.getMonth(),i).getTime(),false]);
    var tail=(7-(cells.length%7))%7;
    for(i=1;i<=tail;i++)cells.push([new Date(d.getFullYear(),d.getMonth()+1,i).getTime(),true]);
    cells.forEach(function(c){
      var k=ymd(c[0]),b=el("button",null,String(new Date(c[0]).getDate()));b.type="button";
      if(c[1])b.className="pad";
      if(k===todayK)b.className+=" today";
      if(k===selK)b.className+=" sel";
      b.onclick=function(){pick(c[0])};grid.appendChild(b)})}
  draw();commit();
  return {node:root,read:function(){return[st.start,st.end]}};
}
