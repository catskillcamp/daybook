# Your own Radicchio: a setup guide for Hannah and her Claude

Hannah: this file is for you and your Claude to work through together. Open the Claude desktop app, start a new session in the **Code** tab, and say:

> Read https://github.com/sawn-red-oak/daybook/blob/main/FORK-GUIDE.md and walk me through it, one part at a time.

You don't need to know how to program. Claude does the technical parts and explains what it's doing, and you make the decisions. Anything involving a password, a sign-in or an approval, you do yourself.

---

## For Claude: how to run this guide

- **Go one part at a time.** Say what the part is for in a sentence or two, do it, check it worked, and ask Hannah before moving on. Don't paste the whole guide back at her.
- **Assume no coding background** unless she says otherwise. Explain git, GitHub, commits and forks in plain words the first time they come up. Keep it short.
- **She handles sign-ins, passwords and approvals.** When a step needs one, tell her exactly what she'll see and what to click. Never type a password or a one-time code yourself.
- **Keep a notes file** called `my-notes.md` in her fork. Record what's been done, the decisions she made, and anything left open. Read it at the start of every later session.
- **Follow the project rules** in `CLAUDE.md` in the repo, especially: change only `config.js` and `modules/`.
- Her computer is a **Mac**, and she uses the **Claude desktop app**. Her phone is **Android**.

---

## What Radicchio is

Radicchio is a small web app that Eamon built for tracking work and making invoices. It runs in a phone's browser or as a home-screen app, keeps its data on the device, and works offline. There's no app store and no server, just files hosted on the web.

The code has two layers:

- **`core/`** is shared by everyone. Eamon maintains it: storage, invoices, settings, backups, and soon Google Drive sync.
- **`modules/`** holds the features, each in one file that can be switched on or off in `config.js`. Eamon's version uses `time` (clock in/out) and `quotes`.

Hannah's version is a **fork**: her own copy of the project on GitHub. She changes it freely in `config.js` and `modules/`, and pulls in Eamon's core improvements with one button, **Sync fork**. As long as she doesn't edit `core/`, those updates arrive without clashing with her changes.

**What Hannah wants to build:** tracking the food she buys for cooking at Sawkille Furniture against a **fixed weekly budget**. Some weeks she'll land a bit over and some a bit under, and she wants to see how her spending compares to the budget. Later she'll also scan receipts with her phone camera, and upload online-order PDFs on her computer, to fill in the purchases automatically. How this turns into invoices is still to be worked out with her.

### What's ready and what isn't (as of November 2026)

| Ready now | Coming from Eamon later |
|---|---|
| The app shell, settings, clients, invoices, backups | Google Drive sync, so phone and computer share the same data |
| Modules with their own tab and saved data (`modData`) | Invoice line items: expenses on an invoice, not just hours |
| Line-item editor (`itemEditor` in `core/lineitems.js`) | Receipt and PDF scanning (needs a small server Eamon sets up) |
| Hosting on GitHub Pages | Hosting on Cloudflare |

Until Drive sync arrives, data lives on whichever device it was entered on. Use **Setup → backup json** now and then to keep a copy.

To see what's changed since this guide was written, read the main repo's recent commits:

```sh
gh api repos/sawn-red-oak/daybook/commits --jq '.[0:10][] | .commit.message | split("\n")[0]'
```

---

## Part 1: Tools on the Mac

Hannah already has the Claude desktop app. She also needs:

1. **Git and Python** come with Apple's command-line tools. Check with `git --version`. If macOS offers to install the "command line developer tools", she clicks **Install**, which takes a few minutes.
2. **Homebrew**, a Mac app installer, from https://brew.sh. Install it only if `brew --version` fails. The installer asks for her Mac password in the terminal; she types it herself.
3. **GitHub CLI:** `brew install gh`.

Check with `git --version`, `python3 --version` and `gh --version`.

## Part 2: A GitHub account

1. Hannah creates a free account at https://github.com/signup. She picks the username and email, and Claude doesn't fill in the form. A short, plain username works best, since it becomes part of her app's web address.
2. Sign the terminal in to GitHub: `gh auth login --web`. Pick **GitHub.com**, then **HTTPS**, and answer **Yes** to authenticating Git. A browser window opens with a code; she enters it and approves.
3. Set the name and email her changes are recorded under, using the email of her GitHub account:
   ```sh
   git config --global user.name "Hannah …"
   git config --global user.email "…"
   ```

## Part 3: Make her fork

1. Ask what she wants to call her version, for example "radicchio" or a name of her own. That becomes the repo name.
2. Fork and download it to a folder **outside** iCloud Drive, Google Drive and Dropbox, because syncing services can damage git's files:
   ```sh
   mkdir -p ~/code && cd ~/code
   gh repo fork sawn-red-oak/daybook --clone --fork-name <her-repo-name>
   ```
3. Move this Claude session into `~/code/<her-repo-name>`. From then on, Claude reads `CLAUDE.md` there automatically.
4. Create `my-notes.md` with a first entry, then commit and push it. This is a good moment to explain commit and push.

## Part 4: Run it on the Mac

```sh
cd ~/code/<her-repo-name>
python3 -m http.server 8000
```

Open http://localhost:8000 in Claude's built-in browser, or in hers, and click through the tabs together. It's Eamon's app, unchanged so far.

## Part 5: Make it hers

Edit `config.js` together:

- `name`: what the app is called on her phone and in the header.
- `modules`: which features she keeps. She probably doesn't need `time` (clock in/out) or `quotes`, so ask her. With none switched on, the app has just **invoices** and **setup**, and her own modules add to that.

Reload the page to see the change, then commit and push.

The **icon** (`icon-192.png`, `icon-512.png`) and the name in `manifest.webmanifest` can be hers too. Those files rarely change upstream, so editing them is fine.

## Part 6: Put it on her phone

1. Turn on GitHub Pages for her fork. On GitHub, go to her repo → **Settings** → **Pages** → **Deploy from a branch** → `main`, folder `/ (root)`. Or from the terminal:
   ```sh
   gh api -X POST repos/<her-username>/<her-repo-name>/pages -f "source[branch]=main" -f "source[path]=/"
   ```
2. After a minute or two the app is live at `https://<her-username>.github.io/<her-repo-name>/`.
3. On her Android phone, open that address in Chrome, then **⋮ → Add to Home screen**.
4. Every push to `main` updates the live app. The phone picks up the update the next time the app is opened with signal, then reopened.

## Part 7: Her first module, the weekly food budget

This is the real work, and it should be a conversation. **Interview her before writing any code.** For example:

- What is the weekly budget, and which day does her week start?
- What does she record for each purchase: date, store, amount, what it was for? Does she want categories (produce, dry goods, …)?
- When a week goes over or under, does the difference carry into the next week, or does each week start fresh?
- What does she want to see at a glance: this week's spending against budget, a running total, a list of past weeks?
- How will this reach Sawkille: an invoice per week, per month, at cost or with something added? It's fine to leave this open and build the tracking first.

Then build `modules/budget.js`, or whatever she names it, following `CLAUDE.md`:

- Give it its own tab: `tab: {key: "budget", label: "budget"}`.
- Keep purchases in `modData("budget")`, as an object keyed by `uid()` with an `updatedAt: now()` on every record. Keep the weekly budget there too.
- Reuse core pieces: `openSheet` with a sheet builder for the add/edit form, `fieldOf`, `inp`, `calendar` for dates, `money()` for amounts, `toast()` for confirmations. `modules/quotes.js` shows them all in use.
- Add `"budget"` to `modules` in `config.js`. Nothing else needs wiring.

Try it on the Mac, adjust it with her, then push it and try it on her phone. Expect a few rounds; that's normal.

## Part 8: Getting Eamon's updates

When Eamon improves core (Drive sync, line items, receipts), she pulls the changes in:

- On GitHub: her repo → **Sync fork** → **Update branch**. Or:
  ```sh
  gh repo sync <her-username>/<her-repo-name> && git pull
  ```

If a sync reports a conflict, some file outside `config.js`, `modules/`, the icons or the manifest was edited. Undo that edit in her fork, and ask Eamon for the change in core instead.

## Part 9: Asking Eamon for a core change

If her module needs something core doesn't offer yet, don't edit `core/`. Open an issue on the main repo describing what she needs and why:

```sh
gh issue create --repo sawn-red-oak/daybook --title "…" --body "…"
```

---

## Rules, in short

1. Change only `config.js`, `modules/`, `my-notes.md`, and the icons and manifest name if she wants.
2. Module data goes in `modData("<id>")`: records keyed by id, each with `updatedAt`.
3. Keep the repo folder outside any cloud-synced folder.
4. Hannah does every sign-in, password and approval herself.
5. Commit and push small changes often, with a plain-English message saying what changed and why.
