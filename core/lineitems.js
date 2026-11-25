"use strict";
/* Line items {desc, qty, unit, rate} and the editor for them. */

function itemAmount(it){
  var q=parseFloat(it.qty), r=parseFloat(it.rate);
  if(!isFinite(q)||!isFinite(r)) return 0;
  return Math.round(q*r*100)/100;
}

/* ---------- quote line items ---------- */
function itemEditor(sh,get,set,onChange){
  var box=el("div"); sh.appendChild(box);
  function amtNodes(){ return box.querySelectorAll(".item .amt") }
  function refresh(){
    var list=get(), ns=amtNodes();
    Array.prototype.forEach.call(ns,function(n,i){ if(list[i]) n.textContent=money(itemAmount(list[i])) });
    if(onChange) onChange();
  }
  function field(parent,label,node){
    var l=el("label","field");l.appendChild(el("span",null,label));l.appendChild(node);
    parent.appendChild(l);return node;
  }
  function paint(){
    box.innerHTML="";
    var list=get();
    list.forEach(function(it,i){
      var card=el("div","item");
      var di=field(card,"description",inp("text",it.desc||"",""));
      di.addEventListener("input",function(){it.desc=di.value;set(list);touch()});
      var g=el("div","three");
      ["qty","unit","rate"].forEach(function(key){
        var n=el("input");
        if(key==="unit"){ n.type="text"; n.maxLength=6; }
        else { n.type="number"; n.step="any"; n.setAttribute("inputmode","decimal"); }
        n.value=it[key]==null?"":it[key];
        n.addEventListener("input",function(){it[key]=n.value;set(list);touch();refresh()});
        field(g,key,n);
      });
      card.appendChild(g);
      var foot=el("div","foot");
      var del=el("button","del","\u00d7");del.type="button";
      del.setAttribute("aria-label","remove line");
      del.onclick=function(){var l2=get().slice();l2.splice(i,1);set(l2);touch();paint()};
      foot.appendChild(del);
      foot.appendChild(el("span","amt",money(itemAmount(it))));
      card.appendChild(foot);
      box.appendChild(card);
    });
    var add=el("button","btn bare","+ add line");add.type="button";
    add.onclick=function(){
      var l2=get().slice();l2.push({desc:"",qty:"",unit:"",rate:""});set(l2);touch();paint()};
    box.appendChild(add);
    refresh();
  }
  paint();
  return {paint:paint,refresh:refresh};
}
