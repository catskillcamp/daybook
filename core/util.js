"use strict";
/* Small helpers: dates, money, escaping, toasts. */

/* ---------- small helpers ---------- */
var $=function(s){return document.querySelector(s)};
var el=function(t,c,x){var n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n};
var now=function(){return Date.now()};
function uid(){try{if(window.crypto&&crypto.randomUUID)return crypto.randomUUID().replace(/-/g,"").slice(0,16)}catch(e){}
  return (Date.now().toString(36)+Math.random().toString(36).slice(2,10)).replace(/[^a-z0-9]/g,"")}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function pad(n){return n<10?"0"+n:""+n}

var DOWS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
var MONS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sept","Oct","Nov","Dec"];
var MONS_FULL=["january","february","march","april","may","june","july","august","september","october","november","december"];
var DOW2=["mo","tu","we","th","fr","sa","su"];
function ymd(ms){var d=new Date(ms);return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
/* "Sun Sept 06 2026" */
function dlong(ms){var d=new Date(ms);
  return DOWS[d.getDay()]+" "+MONS[d.getMonth()]+" "+pad(d.getDate())+" "+d.getFullYear()}
/* Anything a person reads spells the month out — "Sept 07 2026" — matching
   the day rows below it. Anything a machine sorts keeps ISO: the CSV date
   column, the JSON, and the report filenames. A written month is unambiguous
   across conventions, where 09-07 is not. */
function dateWords(iso){
  var p=String(iso||"").split("-");
  if(p.length!==3) return String(iso||"");
  var mo=+p[1], da=+p[2];
  if(!(mo>=1&&mo<=12)||!(da>=1&&da<=31)) return String(iso||"");
  return MONS[mo-1]+" "+pad(da)+" "+p[0];
}
function dlongKey(k){var p=k.split("-");return dlong(new Date(+p[0],+p[1]-1,+p[2]).getTime())}
/* "3:26p" / "7:17a" */
function t12(ms){var d=new Date(ms),h=d.getHours(),m=d.getMinutes(),ap=h<12?"a":"p";
  h=h%12; if(h===0)h=12; return h+":"+pad(m)+ap}
function hm24(ms){var d=new Date(ms);return pad(d.getHours())+":"+pad(d.getMinutes())}
function monthKey(ms){var d=new Date(ms);return d.getFullYear()+"-"+pad(d.getMonth()+1)}
function startOfDay(ms){var d=new Date(ms);d.setHours(0,0,0,0);return d.getTime()}
function startOfWeek(ms){var d=new Date(startOfDay(ms));d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime()}
function addDays(ms,n){var d=new Date(ms);d.setDate(d.getDate()+n);return d.getTime()}
function startOfMonth(ms){var d=new Date(ms);return new Date(d.getFullYear(),d.getMonth(),1).getTime()}
function hhmmss(ms){if(ms<0)ms=0;var s=Math.floor(ms/1000);
  return Math.floor(s/3600)+":"+pad(Math.floor(s%3600/60))+":"+pad(s%60)}
function money(n){return (S.settings.currency||"$")+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
/* Autocorrect and autocapitalise off everywhere — notes are lower-case
   shop shorthand and neither helps. Spellcheck and autocomplete are left
   at the browser default, EXCEPT on setup and the client sheet: name +
   email + phone + address is the shape Chrome reads as an address form,
   and that is what made it interrupt with a save-address prompt. Nothing
   there benefits from autofill anyway — it is your own detail, typed once. */
function tuneInputs(root){
  var ns=(root||document).querySelectorAll("input,textarea,select");
  Array.prototype.forEach.call(ns,function(n){
    n.setAttribute("autocorrect","off");
    n.setAttribute("autocapitalize","off");
    n.setAttribute("spellcheck","false");
    n.setAttribute("autocomplete","off");
    n.setAttribute("data-form-type","other");
    n.setAttribute("data-lpignore","true");
    if(n.type==="email"){ n.type="text"; n.setAttribute("inputmode","email"); }
  });
}
function toast(m){var t=$("#toast");t.textContent=m;t.hidden=false;
  clearTimeout(toast._t);toast._t=setTimeout(function(){t.hidden=true},2600)}
/* Safe as a file or folder name everywhere, including Windows, which drops a
   trailing dot or space (so "Kolb Machine Inc." becomes "Kolb Machine Inc"). */
function safeName(s){return String(s||"").replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").trim().replace(/[. ]+$/,"")||"unnamed"}
function placeLabel(p){return p==="remote"?"Remote":"On-site"}
