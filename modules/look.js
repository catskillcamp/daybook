/* Look module: this copy's own font and colours. Core sets every font and
   colour through a few CSS variables (--f, --bg, --fg, --dim, --faint, --line,
   --line-2, --online), so overriding those here restyles the whole app.
   Saved invoices keep core's own document styling.

   Scheme: graphite. Every text colour reads at 8:1 or better on the
   background (faintest 8.0:1, dim 11.8:1, main 16.0:1). */
(function(){
"use strict";
if(!moduleOn("look")) return;

var BG="#17181A";

/* the phone's status bar and browser bar follow the background */
var tc=document.querySelector('meta[name="theme-color"]');
if(tc) tc.setAttribute("content",BG);

registerModule({
  id:"look",
  css:[
    ":root{color-scheme:dark;",
    "  --f:Arial,Helvetica,'Helvetica Neue',sans-serif;",
    "  --bg:"+BG+"; --fg:#F3F3F1; --dim:#D2D3D0; --faint:#AEAFAA;",
    "  --line:#303134; --line-2:#4A4B4F; --online:#7BC98F}",
    /* a row being dragged sits just above the background */
    ".klist li.drag{background:#222326}",
    /* hint text in empty fields, and other months' days in the calendar,
       were drawn fainter than --faint; keep them readable */
    "::placeholder{color:var(--faint);opacity:1}",
    ".cal .grid button.pad{opacity:.8}"
  ].join("\n")
});
})();
