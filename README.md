# Warrant Return Tracker 2.0

Desktop app that tracks search warrants from signature to filed return: deadline reminders, court-ready returns and notices generated from **any agency's own Word templates**, document storage with SHA-256 hashes, and a full audit trail.

Version 2 is a full rebuild of v1 (whose source was lost). It keeps every v1 feature and imports v1 data.

## What's new vs. v1

| Area | v1 | v2 |
|---|---|---|
| Return dates | Hard-typed in the template ("5TH DAY OF DECEMBER 2023") - never changed | Every date, the officer name, badge, county and agency are merge fields |
| Templates | One fixed EDSO template | Import any agency `.docx`, field inspector, numbered `{1}` tags still supported via mapping, filters (`| upper`, `| date:"..."`), live preview, test with sample data |
| Editing | Due date only | Every field, with optional reason; each change logged old -> new |
| Warrant PDF | Link to wherever the file sat on disk | Copied into the app, SHA-256 hashed, integrity check, in-app viewer |
| Intake | Manual | Drop the PDF; warrant #, case #, judge, signed date, provider, account/address detected (you verify) |
| Reminders | Fired only on the exact day, only if the app was open | Catch-up after sleep/shutdown, daily overdue alerts, snooze, daily email digest, tray mode, start with Windows |
| Dates | Parsed as UTC (could be a day off in Pacific time) | Local calendar dates everywhere; court-day rules with holidays |
| Email | Password in plain text, TLS verification off | Password encrypted with Windows DPAPI, TLS verification on |
| Records | - | Audit log, case summary PDF (chain of custody), case packet zip, docket PDF, CSV, .ics calendar |
| Security | - | Optional PIN lock with auto-lock and lock-with-Windows, strict sandbox/CSP, Electron security fuses |
| Data | Single DB file | Daily snapshots, full backup/restore, portable mode |
| Signature | Scanned image baked into one template | Draw or import once; inserted at `{signature}` in any template (2.1) |
| Amendments | - | Record amendments with signed copy, due-date change and added scope (2.1) |

## Using it

1. Run the app. First launch asks for your officer & agency details (these fill the templates).
2. **Add a warrant**: drag the signed warrant anywhere onto the window (or `Ctrl+N`). Check the pre-filled fields (purple), choose the due-date rule, save.
3. The **Dashboard** shows overdue / due-soon warrants first. Reminders go out automatically.
4. When served, **Mark executed**. For CalECPA warrants, **Generate** the notification.
5. **Generate return**: confirm dates and the place searched, list the property taken (or paste a list), watch the live preview, save. The warrant is archived (optional) and a hashed copy of the return is kept.

Shortcuts: `Ctrl+K` search everything, `Ctrl+N` new warrant, `Ctrl+L` lock.

## Signature

**Settings > Signature**: draw your signature (mouse, touchpad, touchscreen or pen) or import a photo/scan - the paper background is removed and the ink can be recolored black or blue. It is stored encrypted with Windows DPAPI for your Windows account only (not included in backups) and placed wherever a template has a `{signature}` tag; the built-in return has one above the officer's signature line. The return wizard has a "Sign with my saved signature" switch per document, and every signed document is recorded in the audit log.

## Amendments

**Amend** on a warrant records an amendment: date signed, judge, what changed, added places/items (optionally appended to the places searched in the return), an optional new due date (keep, restart from the amendment date with a rule, or set a date - logged and reminders restart), and the signed amendment document (stored and hashed). Amendments show on the warrant, the warrant list, the docket and the case summary PDF. Template fields: `{amendmentCount}`, `{asAmendedText}`, `{amendmentsText}`, `{amendedDate...}` and a `{#amendments}...{/amendments}` loop.

## Templates for other agencies

Open your agency's form in Word and type tags where data goes, then **Templates > Import .docx template**:

```
STATE OF {state | upper}                SEARCH WARRANT# {warrantNumber}
I, {officerTitleName | upper}, ... I RECEIVED SAID WARRANT ON THE {receivedDateLegal | upper}
AND UNDER ITS AUTHORITY, I, ON {searchDate | upper}, SEARCHED THE PREMISES ...
{locations}
AND THERE I DISCOVERED:
{itemsText}
```

- Full list: **Templates > Field reference** (click a tag to copy it).
- Every date has variants: `signedDate` (March 2, 2026), `signedDateShort` (03/02/2026), `signedDateLegal` (2nd day of March, 2026), `signedDay`, `signedDayOrdinal`, `signedMonth`, `signedYear`, `signedWeekday`, `signedDateISO`. Same for `received`, `search`, `due`, `filed`, `notification`, `today`.
- Filters: `| upper`, `| lower`, `| title`, `| date:"MMMM Do, YYYY"` (on an `...ISO` field), `| default:"N/A"`.
- Repeating inventory rows: `{#items}{index}. {qtyWords} ({qty}) {description} - {locationFound}{/items}`.
- Old templates with `{1} {2} {3}` work: map each number to a field in the template settings.
- **Test** fills the template with sample data and opens it in Word.

Built-in templates (California return, PC 1546.2 notification) are generic - no names, badges or signatures.
Your personal EDSO return with your signature image is generated to `office-templates/` (not in git): import it under Templates if you want the signature embedded.

## Deployment notes for IT

- **No admin rights.** Installer is per-user (`%LOCALAPPDATA%\Programs`), `requestedExecutionLevel=asInvoker`.
- Three builds in `release/`: `WarrantReturnTracker-Setup-x.y.z.exe` (per-user installer), `WarrantReturnTracker-Portable-x.y.z.exe` (single file, extracts to %TEMP% each launch), and `win-unpacked/` (plain folder - zip it and run `Warrant Return Tracker.exe`; the most AppLocker-friendly option, whitelist by path or hash).
- **Portable mode**: create a folder named `data` next to the EXE and all data stays in it.
- Otherwise data lives in `%APPDATA%\WarrantReturnTracker` (DB, attachments, templates, backups, log).
- **No network access** except the agency SMTP server if email reminders are enabled. No telemetry, no auto-update, no CDN; all code is bundled.
- **No native modules** (SQLite runs as WebAssembly) - nothing compiled, nothing loaded from outside the signed archive.
- Electron fuses: RunAsNode **off**, NODE_OPTIONS **off**, `--inspect` **off**, ASAR integrity validation **on**, only load app from ASAR **on**, cookie encryption **on**, file:// extra privileges **off**.
- Renderer is sandboxed with context isolation, strict CSP, all permission requests denied, navigation/new windows blocked; UI is served from a private `app://` scheme.
- Secrets (SMTP password) are encrypted per Windows user with DPAPI (`safeStorage`); the app PIN is a salted scrypt hash.
- **Code signing**: builds are unsigned, so SmartScreen will warn on first run. For agency-wide rollout, sign with the agency's code-signing certificate (set `CSC_LINK`/`CSC_KEY_PASSWORD` or `win.signtoolOptions` and rebuild) so the EXE can be allow-listed by publisher.

## Building from source

Requires Node.js 22+ on Windows.

```bash
npm install
npm test                 # unit tests (dates, reminders, template rendering)
npm start                # build + run
npm run dist             # build installer, portable EXE and unpacked folder into release/
node tests/e2e/run.mjs   # end-to-end test driving the real app (throw-away data folder)
```

Regenerate the built-in templates from the original agency forms (kept locally in `original-templates/`):

```bash
node scripts/make-templates.mjs original-templates
```

Layout: `src/main` (Electron main process: database, templates, reminders, email, reports, backup, IPC), `src/preload` (bridge), `src/renderer` (React UI), `src/shared` (types, date logic, field catalog), `resources/` (built-in templates, icons), `tests/`.
