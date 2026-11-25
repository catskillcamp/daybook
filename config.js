/* ============================================================
   config.js — the one file each version of the app edits.

   Everything that makes your copy yours goes here: the name,
   which modules are switched on, and (later) theme and defaults.
   The code in core/ is shared between versions; leave it alone
   in a fork so fixes from the main app can be pulled in cleanly.
   ============================================================ */
var CONFIG = {
  /* Google Drive sync: the OAuth client ID of a Google Cloud project whose
     allowed origins include this app's address (see "Google Drive sync" in
     FORK-GUIDE.md). Not a secret. "" keeps the app offline-only. */
  googleClientId: "159490205161-9o8k40c7ro83laj95r0em8vg9sj7nrva.apps.googleusercontent.com",

  /* The folder in Google Drive that holds the data, invoices and quotes. */
  driveFolder: "Radicchio",

  /* Shown in the header and on the browser tab. */
  name: "Radicchio",

  /* Features to switch on. Each is a file in modules/.
       "time"   — clock in/out, time blocks, invoices from hours
       "quotes" — quotes with line items, templates
       "prints" — price 3D print jobs and bill them                */
  modules: ["time", "quotes", "prints"]
};
