# Warrant Return Tracker

**Track every search warrant from signature to filed return, and generate the court paperwork in seconds.**

Built for detectives and forensic examiners: return deadlines and reminders, court-ready returns and CalECPA notices from **your agency's own Word templates**, your signature applied automatically, hashed document storage, and a full audit trail. It runs as a normal Windows program with **no admin rights, no internet and no server**, so it works on locked-down agency computers.

[**Download the latest version**](https://github.com/AaronCuddeback/warrant-return-tracker/releases/latest): Setup EXE (recommended), plain folder zip for strict AppLocker environments, or portable EXE.

![Walkthrough: add a warrant from its PDF, generate a signed return, and review deadlines](docs/walkthrough.gif)

<sub>The walkthrough and screenshots use made-up demo data: a fictional officer, agency, court, judge and cases.</sub>

## Highlights

- **Never miss a return.** Due dates from statute or court-day rules (with holidays), overdue and due-soon queue, desktop/email reminders that catch up after sleep or shutdown, daily digest, calendar export.
- **Intake from the PDF.** Drop the signed warrant; the details are read for you to confirm. The PDF is stored with the case and SHA-256 hashed.
- **Returns that are right the first time.** Every date, name, badge, county and court is a merge field, so there is no stale text. Itemized inventory with quantities in words, saved standard language, live preview, signature placed automatically.
- **Any agency's form.** Import your own `.docx` with simple `{tags}`. Built-in generic California return and PC 1546.2 notification included.
- **Amendments, documents, audit trail.** Amendments with due-date changes, every document hashed, every action logged; case summary/chain-of-custody PDF and case packet zip.
- **Made for agency IT.** Per-user install, no native modules, no telemetry, strict sandbox and Electron security fuses, DPAPI-encrypted secrets, optional PIN lock, portable mode, backups.

## Screenshots

<table>
<tr>
<td width="50%" valign="top"><a href="docs/screenshots/dashboard.png"><img src="docs/screenshots/dashboard.png" alt="Dashboard"></a><br><b>Dashboard</b><br><sub>Overdue and due-soon warrants first, the next 14 days, CalECPA notices still owed, and recent activity.</sub></td>
<td width="50%" valign="top"><a href="docs/screenshots/intake.png"><img src="docs/screenshots/intake.png" alt="Drop the signed warrant"></a><br><b>Drop the signed warrant</b><br><sub>Warrant #, case #, judge, signed date, provider and target are read from the PDF and marked in purple for you to verify.</sub></td>
</tr>
<tr>
<td width="50%" valign="top"><a href="docs/screenshots/return-preview.png"><img src="docs/screenshots/return-preview.png" alt="Court-ready return, signed"></a><br><b>Court-ready return, signed</b><br><sub>Live preview of exactly what will be saved, using your agency's own Word template and your stored signature.</sub></td>
<td width="50%" valign="top"><a href="docs/screenshots/return-property.png"><img src="docs/screenshots/return-property.png" alt="Property taken"></a><br><b>Property taken</b><br><sub>Itemized inventory with quantities written out ("Three (3)"), where found, and one-click standard language.</sub></td>
</tr>
<tr>
<td width="50%" valign="top"><a href="docs/screenshots/return-saved-text.png"><img src="docs/screenshots/return-saved-text.png" alt="Saved text"></a><br><b>Saved text</b><br><sub>Reusable wording for service-provider records and seized-device extractions, suggested by warrant type.</sub></td>
<td width="50%" valign="top"><a href="docs/screenshots/warrant-detail.png"><img src="docs/screenshots/warrant-detail.png" alt="Every warrant at a glance"></a><br><b>Every warrant at a glance</b><br><sub>Progress, checklist, deadline with court-day rules, reminders, amendments, and one-click exports.</sub></td>
</tr>
<tr>
<td width="50%" valign="top"><a href="docs/screenshots/warrant-documents.png"><img src="docs/screenshots/warrant-documents.png" alt="Documents with SHA-256"></a><br><b>Documents with SHA-256</b><br><sub>The signed warrant, amendments and generated returns are stored with the case, hashed and verifiable.</sub></td>
<td width="50%" valign="top"><a href="docs/screenshots/warrant-activity.png"><img src="docs/screenshots/warrant-activity.png" alt="Audit trail"></a><br><b>Audit trail</b><br><sub>Every change, document, signature and export is logged with user and time. Old and new values side by side.</sub></td>
</tr>
<tr>
<td width="50%" valign="top"><a href="docs/screenshots/warrants.png"><img src="docs/screenshots/warrants.png" alt="Caseload"></a><br><b>Caseload</b><br><sub>Filter by status and type, search everything, export CSV or a docket PDF.</sub></td>
<td width="50%" valign="top"><a href="docs/screenshots/calendar.png"><img src="docs/screenshots/calendar.png" alt="Calendar"></a><br><b>Calendar</b><br><sub>All return deadlines by month. Export to Outlook (.ics).</sub></td>
</tr>
<tr>
<td width="50%" valign="top"><a href="docs/screenshots/templates.png"><img src="docs/screenshots/templates.png" alt="Any agency's template"></a><br><b>Any agency's template</b><br><sub>Import your own .docx with merge tags. Field reference, sample-data test and number-tag mapping included.</sub></td>
<td width="50%" valign="top"><a href="docs/screenshots/reports.png"><img src="docs/screenshots/reports.png" alt="Reports, exports and backup"></a><br><b>Reports, exports and backup</b><br><sub>Stats by judge and provider, docket PDF, CSV, audit log, full backup and restore, daily snapshots.</sub></td>
</tr>
<tr>
<td width="50%" valign="top"><a href="docs/screenshots/settings-signature.png"><img src="docs/screenshots/settings-signature.png" alt="Signature"></a><br><b>Signature</b><br><sub>Draw it or import a scan once. Stored encrypted with Windows DPAPI and placed on every return.</sub></td>
<td width="50%" valign="top"><a href="docs/screenshots/settings-saved-text.png"><img src="docs/screenshots/settings-saved-text.png" alt="Manage saved text"></a><br><b>Manage saved text</b><br><sub>Edit the standard wording or add your own, and choose which warrant types it is suggested for.</sub></td>
</tr>
<tr>
<td width="50%" valign="top"><a href="docs/screenshots/settings-reminders.png"><img src="docs/screenshots/settings-reminders.png" alt="Reminders"></a><br><b>Reminders</b><br><sub>Desktop notifications, agency SMTP email or Outlook drafts, lead times and daily overdue alerts.</sub></td>
<td width="50%" valign="top"><a href="docs/screenshots/command-palette.png"><img src="docs/screenshots/command-palette.png" alt="Ctrl+K for everything"></a><br><b>Ctrl+K for everything</b><br><sub>Jump to any warrant, case, target or action from the keyboard.</sub></td>
</tr>
<tr>
<td width="50%" valign="top"><a href="docs/screenshots/dashboard-light.png"><img src="docs/screenshots/dashboard-light.png" alt="Light theme"></a><br><b>Light theme</b><br><sub>For bright offices and printing screenshots into reports.</sub></td>
<td width="50%" valign="top"><a href="docs/screenshots/lock.png"><img src="docs/screenshots/lock.png" alt="PIN lock"></a><br><b>PIN lock</b><br><sub>Optional PIN with auto-lock and lock-with-Windows for shared or unattended workstations.</sub></td>
</tr>
</table>

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
| Inventory | Typed every time | Saved text library with standard provider-data and seized-device language, suggested by warrant type (2.2, 2.3) |
| Property receipts | - | Attach one or more receipt PDFs/photos; they follow the return as page 2 onward, with a "See attached" line (2.4, 2.5) |

## Using it

1. Run the app. First launch asks for your officer & agency details (these fill the templates).
2. **Add a warrant**: drag the signed warrant anywhere onto the window (or `Ctrl+N`). Check the pre-filled fields (purple), choose the due-date rule, save.
3. The **Dashboard** shows overdue / due-soon warrants first. Reminders go out automatically.
4. When served, **Mark executed**. For CalECPA warrants, **Generate** the notification.
5. **Generate return**: confirm dates and the place searched, list the property taken (or paste a list), watch the live preview, save. The warrant is archived (optional) and a hashed copy of the return is kept.

Shortcuts: `Ctrl+K` search everything, `Ctrl+N` new warrant, `Ctrl+L` lock.

## Signature

**Settings > Signature**: draw your signature (mouse, touchpad, touchscreen or pen) or import a photo/scan - the paper background is removed and the ink can be recolored black or blue. It is stored encrypted with Windows DPAPI for your Windows account only (not included in backups) and placed wherever a template has a `{signature}` tag; the built-in return has one above the officer's signature line. The return wizard has a "Sign with my saved signature" switch per document, and every signed document is recorded in the audit log.

## Saved text (canned inventory language)

The return wizard's **Property taken** step has a **Saved text** menu of reusable wording. It ships with standard language for electronic data produced by a service provider (suggested on service-provider warrants) and for data extracted from seized electronic devices (suggested on device, premises, vehicle and person warrants). One click adds either as an inventory item. Save any item's wording with its bookmark button, and manage the list (and which warrant types each phrase is suggested for) in **Settings > Saved text**.

## Property receipts

In the return wizard's **Property taken** step, **Attach receipts** stores the property receipt sheets (PDF, JPG or PNG; select several at once) with the warrant, hashed like every other document. All of them are added to the generated return after page 1, in the order listed, each page in its own narrow-margin section so it prints close to full size. Reorder sheets with the arrows, untick one to leave it out of this return, or remove a wrong file. *"See attached Property Receipt, incorporated herein by reference."* is added to the property list once (edit the wording in **Settings > Saved text**). The live preview shows the receipt pages, and the audit log records which receipt became which page of which return. Receipts already on the warrant (Documents tab, type "Property receipt") are included automatically.

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
npm run showcase         # regenerate docs/screenshots and docs/walkthrough.gif with demo data (needs ffmpeg)
```

Regenerate the built-in templates from the original agency forms (kept locally in `original-templates/`):

```bash
node scripts/make-templates.mjs original-templates
```

Layout: `src/main` (Electron main process: database, templates, reminders, email, reports, backup, IPC), `src/preload` (bridge), `src/renderer` (React UI), `src/shared` (types, date logic, field catalog), `resources/` (built-in templates, icons), `tests/`.
