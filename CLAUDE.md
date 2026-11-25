# Radicchio (currently still named Daybook)

A time-tracking and invoicing app for phone and desktop. Plain HTML, CSS and JavaScript: no build step, no npm. Open `index.html` through any static web server to run it.

## Layout

```
index.html     the page: markup only, then loads the scripts below in order
config.js      name and which modules are on            ← each version edits this
core/          shared by every version                  ← maintained upstream
  app.css        all styles
  util.js        helpers (dates, money, toasts)
  registry.js    how modules plug in; renderAll()
  store.js       the data object S in localStorage; numbering, rounding
  files.js       folder writes, share sheet, CSV
  lineitems.js   line items and their editor
  sheets.js      bottom sheets, checklist, calendar
  invoices.js    invoices tab, invoice documents, document viewer
  setup.js       setup tab, clients, settings
  backup.js      backup import (merge / replace)
  boot.js        start-up; loaded last
modules/       features that can be switched on or off  ← add your own here
  time.js        clock, time blocks, invoices from hours
  quotes.js      quotes and templates
sw.js          offline cache; list every new file in SHELL
```

## Rules

- **Customise in `config.js` and `modules/`.** Don't edit `core/` in a fork. Fixes there come from the main repo through GitHub's "Sync fork", and local edits to `core/` make those syncs conflict. If core needs a change, raise it with the main repo.
- **A new feature is a new module.** Copy the shape of `modules/quotes.js`: wrap the file in `(function(){ ... })()`, start with `if(!moduleOn("<id>")) return;`, and end with `registerModule({...})`. The comment at the top of `core/registry.js` lists what a module can provide. Add its id to `CONFIG.modules`, add its `<script>` tag to `index.html` before `core/boot.js`, and add it to `SHELL` in `sw.js`.
- Tabs, panels and buttons that belong to a module carry `data-module="<id>"` in `index.html`, so they hide when the module is off.
- Scripts are classic scripts sharing one global scope, not ES modules. Core's functions and `S` are global. Inside a module, keep everything private and expose it only through `registerModule`.
- Data lives in `S` (see `defaults()` in `core/store.js`). Never remove or rename an existing key: other devices and old backups still carry it. Add new keys with a default.
- After a change, bump `VERSION` in `core/store.js` so the service worker picks up the new files.
