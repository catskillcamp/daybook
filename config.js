/* ============================================================
   config.js — the one file each version of the app edits.

   Everything that makes your copy yours goes here: the name,
   which modules are switched on, and (later) theme and defaults.
   The code in core/ is shared between versions; leave it alone
   in a fork so fixes from the main app can be pulled in cleanly.
   ============================================================ */
var CONFIG = {
  /* Shown in the header and on the browser tab. */
  name: "Radicchio",

  /* Features to switch on. Each is a file in modules/.
       "time"   — clock in/out, time blocks, invoices from hours
       "quotes" — quotes with line items, templates                */
  modules: ["time", "quotes"]
};
