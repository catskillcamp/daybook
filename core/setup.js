"use strict";
/* Setup tab: clients, your details, settings. */

/* ---------- render: setup ---------- */
function renderSetup(){
  if(typeof renderDrive==="function") renderDrive();
  var cl=$("#clientList");cl.innerHTML="";
  var cs=liveClients();
  if(!cs.length)cl.appendChild(el("div","empty","none yet"));
  else{
    var log=el("div","log");
    cs.forEach(function(c){
      var row=el("div","row"),body=el("div","body"),l1=el("div","l1");
      l1.appendChild(el("span",null,c.name));
      l1.appendChild(el("span","hrs",c.rate?money(+c.rate)+"/h":"—"));
      body.appendChild(l1);
      body.appendChild(el("div","place","next invoice "+nextNumber(c)));
      row.appendChild(body);
      row.onclick=function(){openSheet({kind:"client",id:c.id})};
      row.tabIndex=0;
      row.onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();openSheet({kind:"client",id:c.id})}};
      log.appendChild(row)});
    cl.appendChild(log);
  }
  var fr=$("#folderRow");fr.innerHTML="";
  if(typeof driveOn==="function"&&driveOn()){
    fr.appendChild(el("div","note","Google Drive is connected, so it holds the one copy every device mirrors: data, invoices and quotes all go to "+DRIVE_ROOT+"/ in Drive. On a computer with Google Drive for Desktop, that folder appears under My Drive."));
  }else if(!folderSupported()){
    fr.appendChild(el("div","empty","this browser can't connect a folder — invoices go to the share sheet"));
  }else if(folderHandle){
    var d=el("div");d.style.display="flex";d.style.justifyContent="space-between";d.style.gap="10px";d.style.alignItems="center";
    d.appendChild(el("span",null,folderHandle.name+"/Invoices/"));
    var ch=el("button","btn bare","change");ch.onclick=connectFolder;d.appendChild(ch);
    fr.appendChild(d);
    fr.appendChild(el("div","note","Invoices write to "+folderHandle.name+"/Invoices/<client>/. A copy of all your data is kept at "+folderHandle.name+"/radicchio-data.json."));
  }else{
    var b=el("button","btn","connect folder");b.onclick=connectFolder;fr.appendChild(b);
    fr.appendChild(el("div","note","Pick your Time Tracker folder once. Invoices then write straight into it — no share sheet, no download."));
  }
  $("#bizName").value=S.business.name||"";
  $("#bizEmail").value=S.business.email||"";
  $("#bizPhone").value=S.business.phone||"";
  $("#bizAddr").value=S.business.address||"";
  $("#bizTerms").value=S.business.terms||"";
  $("#setRound").value=String(+S.settings.round||0);
  $("#setRoundMode").value=S.settings.roundMode;
  $("#setNet").value=S.settings.net||0;
  $("#setCur").value=S.settings.currency||"$";
  $("#setPlace").value=S.settings.place||"onsite";
  $("#setInvDir").value=S.settings.invoiceDir||"Radicchio Invoices";
  $("#setDataDir").value=S.settings.dataDir||"Radicchio Data";
  $("#setQuoteDir").value=S.settings.quoteDir||"Radicchio Quotes";
  $("#setQuoteValid").value=S.settings.quoteValid==null?30:S.settings.quoteValid;
  $("#setFilePrefix").value=S.settings.filePrefix||"";
  $("#filePrefixEg").textContent=((S.settings.filePrefix||"").trim()?(S.settings.filePrefix||"").trim()+" ":"")+"Invoice SK007";
  $("#ver").textContent=VERSION;
}

/* --- client --- */
function sheetClient(sh,d){
  var isNew=!d.id;
  var c;
  if(isNew) c=d.draft.rec||(d.draft.rec={id:uid(),name:"",rate:"",email:"",address:"",
    prefix:"",next:1,pad:3});
  else{
    if(!S.clients[d.id]){closeSheet();return}
    if(!d.draft.rec) d.draft.rec=JSON.parse(JSON.stringify(S.clients[d.id]));
    c=d.draft.rec;
  }
  head(sh,isNew?"add client":"edit client");
  function bind(node,key){node.value=c[key]||"";
    node.addEventListener("input",function(){c[key]=node.value;touch()});return node}
  var n=bind(fieldOf(sh,"name",inp("text","","")),"name");
  bind(fieldOf(sh,"hourly rate",inp("number","","")),"rate");
  var twoN=el("div","two");
  var pf=inp("text","","SK"), nx=inp("number","","");
  var lp=el("label","field");lp.appendChild(el("span",null,"invoice prefix"));lp.appendChild(pf);
  var ln=el("label","field");ln.appendChild(el("span",null,"next number"));ln.appendChild(nx);
  twoN.appendChild(lp);twoN.appendChild(ln);sh.appendChild(twoN);
  var nh=el("div","khint");sh.appendChild(nh);
  pf.value=c.prefix||""; nx.value=(c.next==null?1:c.next);
  function showNext(){nh.textContent="Next invoice will be numbered "+nextNumber(c)+"."}
  pf.addEventListener("input",function(){c.prefix=pf.value;touch();showNext()});
  nx.addEventListener("input",function(){c.next=+nx.value||1;touch();showNext()});
  showNext();
  bind(fieldOf(sh,"email",inp("email","","")),"email");
  var a=el("textarea");a.rows=3;fieldOf(sh,"billing address",a);bind(a,"address");
  var btns=el("div","btns");
  var sv=el("button","btn solid grow","save");sv.type="button";
  sv.onclick=function(){
    if(!c.name.trim()){toast("give the client a name");return}
    c.name=c.name.trim();S.clients[c.id]=c;save();
    UI.sheet=null;saveUI();closeSheet();renderAll();toast("client saved")};
  btns.appendChild(sv);
  if(!isNew){
    var del=el("button","btn","remove");del.type="button";
    del.onclick=function(){
      if(del.dataset.armed){S.clients[c.id].deleted=true;save();UI.sheet=null;saveUI();closeSheet();renderAll();
        toast("removed — past entries keep the name");return}
      del.dataset.armed="1";del.textContent="remove — tap again"};
    btns.appendChild(del);
  }
  sh.appendChild(btns);
  setTimeout(function(){try{if(isNew)n.focus()}catch(e){}},60);
}

$("#addClient").addEventListener("click",function(){openSheet({kind:"client"})});

$("#exportAll").addEventListener("click",function(){
  var l=allEntries();if(!l.length){toast("no entries yet");return}
  deliver(["all_hours_"+stamp()+".csv"],toCsv(l),"text/csv;charset=utf-8")});
$("#exportBackup").addEventListener("click",function(){
  deliver(["radicchio_backup_"+stamp()+".json"],JSON.stringify(S,null,1),"application/json")});
$("#writeMasters").addEventListener("click",function(){
  if(!folderHandle){toast("connect a folder first — on a phone use export all blocks");return}
  writeAllDerived().then(function(){
      toast("master sheets written to "+(S.settings.dataDir||"Radicchio Data")+"/")})
    .catch(function(){toast("couldn't write to that folder")})});
$("#importBackup").addEventListener("click",function(){$("#importFile").click()});

[["#bizName","name"],["#bizEmail","email"],["#bizPhone","phone"],["#bizAddr","address"],["#bizTerms","terms"]]
.forEach(function(p){$(p[0]).addEventListener("change",function(){S.business[p[1]]=this.value;save()})});
[["#setRound","round",1],["#setRoundMode","roundMode",0],
 ["#setNet","net",1],["#setCur","currency",0],["#setPlace","place",0],
 ["#setInvDir","invoiceDir",0],["#setDataDir","dataDir",0],
 ["#setQuoteDir","quoteDir",0],["#setQuoteValid","quoteValid",1],["#setFilePrefix","filePrefix",0]]
.forEach(function(p){$(p[0]).addEventListener("change",function(){
  S.settings[p[1]]=p[2]?(+this.value||0):this.value;save();renderAll()})});

CORE_SHEETS.client=sheetClient;
