# 🔏 OpenSign

> **The 100% Free, Open-Source Alternative to DocuSign.**  
> Self-hosted electronic document signing, visual drag-and-drop field placement, multi-signer routing chains, and tamper-evident SHA-256 cryptographic verification.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](#-docker-deployment)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#)

---

## ⚡ The Problem: The $480/Year DocuSign Tax

Commercial platforms like DocuSign and Adobe Sign charge **$10 to $45+ per user/month**, lock basic features behind enterprise sales calls, and cap personal envelopes to just 5 per month.

**OpenSign eliminates this subscription tax completely.**

| Feature | OpenSign (Self-Hosted) | DocuSign Personal ($10/mo) | DocuSign Standard ($25-$40/mo) |
| :--- | :---: | :---: | :---: |
| **Monthly Cost** | **$0 / Forever** | $120/year | $480/year per seat |
| **Envelopes** | **Unlimited** | 5 / month cap | Unlimited |
| **Custom PDF Upload** | **Included** | Included | Included |
| **Drag & Drop Field Studio** | **Included** | Basic | Advanced |
| **Multi-Signer Routing** | **Included** | Single Signer Only | Multi-Signer |
| **Interactive Form Fields** | **6 Field Types** | Basic | Advanced |
| **Data Privacy & Hosting** | **100% On-Premise** | US/Cloud Vendor | US/Cloud Vendor |
| **Cryptographic Verifier** | **Included (`/verify`)** | Proprietary | Proprietary |
| **Audit Certificate** | **ESIGN / eIDAS Compliant** | Included | Included |

---

## ✨ Core Features

* 📄 **Upload Any Custom PDF:** Upload contracts, leases, or NDAs directly from your machine.
* 🎨 **Visual Drag & Drop Studio (`/studio`):** Place signature boxes, initials, printed names, dates, text inputs, and checkboxes with live multi-page coordinate mapping.
* 👥 **Multi-Signer Sequential Routing:** Define signing chains (e.g. Client signs first $\rightarrow$ Vendor counter-signs $\rightarrow$ Final sealed agreement).
* 🔔 **DocuSign Action Required Workflow:** Real-time turn awareness (`Waiting for others` vs `Action Required: Your Turn`) for bilateral agreements.
* 🔒 **DocuSign Multi-Tenant Privacy & Auth:** Dedicated sender accounts (`/api/auth`) with salted SHA-256 credentials; private dashboards with zero envelope leaking.
* 🛡️ **Passcode / PIN Security Gates:** Optional access codes required before recipients can review or execute confidential documents.
* 📧 **Automated 3-Stage Email Engine:** Automated invitation emails, counter-signer turn alerts, and completion emails with binary vector PDF attachments.
* 🎯 **DocuSign Guided Signing Tour (`/sign/:id`):** Step-by-step signer navigation (`START` $\rightarrow$ `NEXT (X remaining)` $\rightarrow$ `FINISH`) with auto-scroll and field validation.
* 🖋️ **Biometric Ink & Initials Modal:** Draw legal ink with Bézier smoothing, choose typed legal cursive styles, and adopt signature + initials in one click.
* 🖨️ **Vector PDF Engine (`pdf-lib`):** Stamps signatures and values directly into PDF coordinate vectors and appends a formal tamper-evident **Certificate of Completion**.
* 🛡️ **Independent Cryptographic Verifier (`/verify`):** Public verifier portal inspects SHA-256 pre-sign/post-sign digests, decompressed PDF streams, and certificates to detect any unauthorized tampering.

---

## 🚀 Quick Start (60 Seconds)

### Option 1: Docker (Fastest)

```bash
git clone https://github.com/Rafail-Vasilakis/opensign.git
cd opensign
docker compose up -d
```
Visit **`http://localhost:3000`** in your browser.

---

### Option 2: Local Node.js

```bash
git clone https://github.com/Rafail-Vasilakis/opensign.git
cd opensign
npm install
npm start
```

---

## 🧭 Application Routes

* **`/`** — Main Management Dashboard (Envelope metrics, status tracking, download signed copies).
* **`/studio`** — Drag & drop field placement studio with multi-page PDF rendering and signer assignment.
* **`/sign/:id`** — Guided legal signing tour for recipients.
* **`/verify`** — Independent cryptographic verification portal (drag & drop any PDF or paste Certificate ID).

---

## 📜 Legal Compliance (ESIGN & eIDAS)

OpenSign is engineered to satisfy statutory requirements under the **United States ESIGN Act (15 U.S.C. § 7001)**, **UETA**, and **European Union eIDAS (Regulation No 910/2014)**:

1. **Intent to Sign:** Explicit interactive drawing or typed signature selection.
2. **Consent to Electronic Transactions:** Mandatory legal disclosure acknowledgement prior to execution.
3. **Cryptographic Integrity:** Unalterable SHA-256 checksums binding document state, signatures, and timestamps.
4. **Tamper-Evident Audit Trail:** Detailed Certificate of Completion recording signer IPs, user-agents, UTC timestamps, and envelope IDs.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
Feel free to check out the [issues page](https://github.com/Rafail-Vasilakis/opensign/issues).

---

## 📄 License

OpenSign is released under the **MIT License**. Free for personal and commercial use forever.
