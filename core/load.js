"use strict";
/* Loads each module named in config.js (modules/<id>.js), then core/boot.js.
   Scripts added with async=false run in the order they are added, after the
   ones already on the page, so boot always runs last. A module file that is
   missing is skipped and the app still starts. */
(function(){
  var list=(CONFIG.modules||[]).map(function(id){return "./modules/"+id+".js"});
  list.push("./core/boot.js");
  list.forEach(function(src){
    var s=document.createElement("script");
    s.src=src; s.async=false;
    document.body.appendChild(s);
  });
})();
