---
title: "HP Victus (VAL-VICTUS) - System Specifications"
version: "2026.06.3"
author: "Gillon Marchetti | The Audiopheliac"
last_updated: "2026-06-20"
repo_link: "https://github.com/MarcArmy2003/The-Audiopheliac"
description: "Specification sheet for VAL-VICTUS, the HP Victus portable workstation owned by Veteran Analytics LLC. Purchased as the lightweight stand-in for the Dell Precision 7540 (GDMARCHE) so Gill can continue work away from the home studio. Single-drive layout, unlike the Precision's C:/D: split."
status: "Active - audio chain confirmed (M4 @ 44.1k intentional); drive-path mapping pending clone sync"
---

# HP Victus (VAL-VICTUS) - System Specifications

## Overview

VAL-VICTUS is a Veteran Analytics LLC business laptop, purchased as the portable stand-in for GDMARCHE (Dell Precision 7540). The Precision is being locked into a fixed configuration in the home studio office as the central brain; the Victus is the machine Gill uses when traveling or working remotely, so the home-office configuration is never interrupted. It also serves as a lighter daily driver than the Precision, which despite being a "mobile" workstation is heavy.

The objective for this machine is that the Cowork project folder operates seamlessly on it, so the Victus can be used in place of the Precision without disrupting Gill's work. The Victus has a **different drive configuration** than the Precision (single drive vs. the Precision's C: + D: split), so GDMARCHE path conventions in CLAUDE.md do not map one-to-one and require a Victus-specific path mapping (see "Cross-Machine Path Mapping" below).

---

## System Identity

- **Device Name:** VAL-VICTUS
- **Model:** HP Victus Gaming Laptop 15-fb1013dx
- **Owner:** Veteran Analytics LLC
- **Form Factor:** Portable laptop (lighter than the Precision 7540)
- **Windows Account:** gillo
- **Role:** Portable stand-in for GDMARCHE; runs the full Cowork project folder when Gill is away from the home studio
- **Status:** Freshly set up, June 2026 (net-new to the enterprise); component upgrades in progress

---

## Processor

- **Manufacturer:** AMD
- **Model:** Ryzen 5 7535HS (6 cores / 12 threads, 3.3 GHz base / up to 4.55 GHz boost, 16MB L3, TSMC 6nm). Corrected 2026-06-18 from an earlier "Ryzen 7 7535HS" mislabel: AMD makes no Ryzen 7 7535HS; the 15-fb1013dx ships the Ryzen 5 7535HS. Verified against HP/Best Buy/Newegg model listings.
- **Architecture:** x64 (64-bit), Zen 3+ (Rembrandt-R)

---

## Memory

- **Installed:** 64GB (2x32GB) DDR5-4800 dual-channel. Upgraded from 8GB single-channel on 2026-06-17. **Verified via PowerShell 7 (not assumed).**
- **Kit:** A-Tech 64GB (2x32GB) DDR5-4800 PC5-38400 CL40 SODIMM 2Rx8 Dual Rank 1.1V Non-ECC, model AT32G2D5S4800ND8N11V (Amazon ASIN B0B17QJVX4, $701.08, delivered 2026-06-17).
- **Slot 1 (bottom-left):** 32GB, 4800 MT/s, ConfiguredClockSpeed 4800.
- **Slot 2 (bottom-right):** 32GB, 4800 MT/s, ConfiguredClockSpeed 4800.
- **Speed note:** Native DDR5-4800 matches the Ryzen 5 7535HS controller cap (officially DDR5-4800 for SO-DIMM). A DDR5-5600 kit would have downclocked to 4800 on this platform, so the 4800 kit was the correct buy: same real-world speed, no wasted premium. Cross-retailer price check (B&H, Newegg, Amazon, Best Buy) corroborated this and showed the $701.08 A-Tech 4800 buy was in range for a 64GB 2x32 4800 kit.
- **Warranty note:** 64GB is self-installed, not HP-sanctioned. HP warranty is 1yr parts/labor. Not an issue unless an HP claim is filed.

## Other Upgrades

- **Storage upgrade:** planned, not yet purchased. Single M.2 2280 slot (see Storage), so the path is clone-and-replace onto a larger single-sided M.2 2280 NVMe (4TB target). Price-watch active for Prime Day 2026 (Jul 8-9).

---

## Storage

- **Configuration:** Single-drive (unlike the Precision's C: + D: split). On VAL-VICTUS the one drive consolidates what GDMARCHE separates across C: (OS/apps/repo) and D: (DAW data, Ableton cache/user library, project backup).
- **Slot count:** ONE M.2 2280 slot (HP Victus 15-fb chassis). No second M.2, no 2.5" bay. Confirmed by chassis family + live single-volume layout; upgrade path is clone-and-replace, not add-a-drive.
- **Current drive:** C: approx 512GB (475GB usable), 275GB free as of 2026-06-17 (Task Manager / File Explorer). **(To confirm)** exact drive model/controller from inside Windows.
- **Planned upgrade:** single-sided M.2 2280 NVMe (Gen4-capable), 4TB target. Value pick tracked: WD Blue SN5000 4TB. Clone current drive via USB-to-M.2 NVMe enclosure + vendor migration tool, then swap. Price-watch active for Prime Day 2026.

---

## Operating System

- **Edition:** Windows 11
- **(To confirm)** Exact edition (Home / Pro), version, and OS build.

---

## Displays & USB-C Port

### USB-C port tier (resolved 2026-06-20)

- **Tier:** USB 3.2 Gen 1 Type-C, 5 Gbps, with USB Power Delivery, DisplayPort 1.4 alt mode, and HP Sleep and Charge. **No Thunderbolt / USB4.**
- **How resolved:** DP alt mode is confirmed by function (the Dell YJ3Y6 adapter drives an external DisplayPort monitor from this port, 2026-06-20). A plain USB-C-to-DP dongle behaves identically on a USB4 / Thunderbolt port or a USB 3.2 port with DP alt mode, so the adapter proves DP alt mode is present but does not by itself establish the tier. The tier comes from the chassis spec.
- **Confirmed:** The Victus 15-fb1013dx has no Thunderbolt (Best Buy model Q&A and the Victus 15 family both confirm no TB3 / TB4).
- **Reasoned inference (one residual):** The "USB 3.2 Gen 1, 5 Gbps, DP 1.4, USB-PD, Sleep and Charge" string is taken from the Victus 15-fb family (the fb0050 sibling), not the fb1013dx-exact HP TechSpec. Same chassis generation and AMD Ryzen 5 7535HS board make it near-certain identical. **(To confirm)** against HP's Product Content Browser TechSpec for fb1013dx to bind it to this exact SKU.

### Display adapter (lanai)

- **Adapter:** Dell YJ3Y6 (DP/N OYJ3Y6, mfr code DBQANBC067), a USB-C male to DisplayPort female video adapter, approximately 6 ft, single-output DP, 4K at 60Hz ceiling. Not MST, not Thunderbolt. First-party Dell accessory (verified against Dell, CDW, and Amazon product data, 2026-06-20).
- **Status:** Confirmed working 2026-06-20, drives the lanai external monitor over DP alt mode.

### Current physical connection (lanai, secondary location)

- Victus USB-C to Dell YJ3Y6 (DBQANBC067) USB-C-to-DP adapter to DP cable to Dell monitor (S/N MX-075DV-74262-1DNU) DP input. The monitor exposes VGA, DVI, and DP only (no HDMI); the Victus has HDMI out plus this USB-C DP-alt-mode path, so the DP-alt-mode route is the working external-display method on the lanai. The adapter's 4K60 ceiling and the port's DP 1.4 both sit well above the external panel's needs.

---

## Networking & Sync

- **Connection:** Ethernet (wired) — "Ethernet 2, Connected" per Windows Settings, 2026-06-14.
- **Project sync:** Qsync from NAS87828E (Veteran Analytics / Rangelight + Audiopheliac project folders)
- **(To confirm)** Whether mapped drives (e.g. M: to \\NAS87828E\Music) are established on this machine, or whether UNC paths are used instead; IP / DHCP reservation if wanted.

---

## Remote Access (VA CAG)

- **Status:** Established and confirmed working 2026-06-15.
- **Method:** OE (non-GFE) path, PIV smart-card auth. The Victus has no built-in card slot, so a keyboard-integrated USB smart-card reader carries the PIV.
- **Client:** Citrix Workspace App installed via the Windows OE Citrix Bundle (WindowsOECitrixBundlePackage.exe) from raportal.vpn.va.gov First Time Downloads. The bundle auto-configured Chrome `*.va.gov` trusted sites. No prior Citrix install, so no conflict/cleanup was needed.
- **Entry point:** "VA CAG" desktop shortcut (custom icon) on the OneDrive-redirected Desktop, opening https://citrixaccess.va.gov; syncs to all machines. Icon at `...\Network and Technology\assets\va-cag.ico`.
- **Auth cert:** @va.gov Authentication cert, issuer "Veterans Affairs User CA". Native-client server (non-browser): citrixaccesspiv.va.gov. ESD: 855-673-4357.
- **Note:** VACertChainFix was not needed (RAPortal smart-card test passed, so the cert chain already validated). Alt MFA (Microsoft Authenticator) is a future path for PIV-exempt users only.

---

## Cross-Machine Path Mapping (Victus vs. GDMARCHE)

CLAUDE.md is written against GDMARCHE's drive layout. Because the Victus is single-drive, the following GDMARCHE paths need a Victus equivalent for the project to run seamlessly. **(All Victus-side paths to be confirmed from the live machine - do not assume.)**

| Purpose | GDMARCHE path | VAL-VICTUS path |
|---|---|---|
| Live project repo | `C:\Users\gillo\6. The-Audiopheliac` | (to confirm - likely under `C:\Users\gillo\Github Clones\`) |
| DAW data (Ableton cache, user library, Creative Studio) | `D:\The Audiopheliac\` | (to confirm - on the single C: drive) |
| Music library | `M:\The Audiopheliac` (maps to `\\NAS87828E\Music`) | (to confirm - mapped drive or UNC) |
| NAS canonical root | `A:\` (`\\NAS87828E\The Audiopheliac`) | (to confirm - mapped drive or UNC) |

---

## Audio / Monitoring Chain

### Confirmed (2026-06-14)

- VAL-VICTUS successfully drives the Office Studio **Yamaha HS7 pair + JBL LSR310S subwoofer**. Audio output is working.
- **First-time setup**, not a regression: the audio chain on this laptop had never been configured before this session.
- **Root cause of the initial no-audio symptom:** the **JBL LSR310S subwoofer was powered off**. Powering it back on restored full output. No driver, routing, or default-device change was required to resolve the reported fault.

### Confirmed via MOTU M Series console + Windows Settings (2026-06-14, Cowork computer-use)

- **Audio interface:** MOTU M4, **serial m4ma0243as** — the *same physical unit* recorded against GDMARCHE in CLAUDE.md. There is ONE M4 shared between GDMARCHE and VAL-VICTUS; it cannot run on both machines simultaneously over its single USB-C connection. Whichever machine has the M4 cabled is the one with studio monitoring. (The Focusrite Scarlett Solo is logged dead, 2026-05-11; the M-Audio AIR Hub remains a possible output-only fallback.)
- **Driver / firmware:** MOTU M Series ASIO driver 4.5.0.551; firmware 2.07. Enumerates cleanly on VAL-VICTUS.
- **Sample rate: 44100 Hz — INTENTIONAL, do not "fix" to 48 kHz.** Spotify is limited to 44.1 kHz; with "Sync Windows sample rate to device" ON (and exclusive-mode playback), forcing the M4 to 48000 breaks Spotify playback. 44.1 kHz is the correct rate for the Victus's daily listening role. The 48 kHz / 24-bit project standard applies to DAW / project work only, not to streaming-listening sessions. Buffer 256; "Sync Windows sample rate to device" ON; "Use lowest latency safety offsets" OFF. (Per Gill, 2026-06-14. Do not recommend 48 kHz for a listening/Spotify context on this machine.)
- **Windows default playback device:** MOTU M Series (inferred from working HS7/JBL playback + the M4 being the detected device; the UWP Settings window is input-gated for computer-use so the Sound panel was not read directly — confirm the Sound > Output device label on a convenient pass).
- **Analog chain (downstream of the M4) — same as GDMARCHE:** VAL-VICTUS (USB-C) > MOTU M4 MONITOR Outs 1-2 (1/4" TRS) > Rolls MX28 LEVEL 3 BAL > JBL LSR310S > Yamaha HS7. The M4 is the shared element, so the analog chain it feeds is unchanged from the GDMARCHE setup; the only Victus-specific variable is the USB connection. The JBL sub power state is the one item that took this chain down this session.
- **Gain staging:** unchanged from the documented MOTU-era chain — source level at origin, M4 MAIN knob = daily speaker volume, M4 headphone knob = headphone volume, MX28 MASTER set once at reference.

---

## Notes for AI Ingestion

- VAL-VICTUS is a full working stand-in for GDMARCHE when Gill is remote, not a throwaway secondary. Configuration on this machine should aim for seamless parity with the Precision's workflow.
- Single-drive layout: GDMARCHE C:/D: path conventions in CLAUDE.md must be translated, not copied. See Cross-Machine Path Mapping.
- Fields marked "To confirm" must be filled from the live machine, not assumed. Per the project's documented failure mode, do not assert documented state as current state.

---

*Last Updated:* 2026-06-20
*Verification Sources:* User-reported context (VAL-VICTUS purpose, ownership, drive layout, upgrades), live troubleshooting session 2026-06-14, RAM upgrade handoff 2026-06-17 (PowerShell 7 verified: 64GB 2x32 DDR5-4800 dual-channel, model 15-fb1013dx). Display / USB-C port path added 2026-06-20: Dell YJ3Y6 (DBQANBC067) adapter verified against Dell, CDW, and Amazon product data and confirmed working on the lanai DP monitor; USB-C port tier (USB 3.2 Gen 1, DP 1.4, no Thunderbolt) confirmed for the Victus 15-fb family, with fb1013dx-exact HP TechSpec still pending. Storage drive model, OS edition, hostname, and path-mapping fields still pending on-machine confirmation.
