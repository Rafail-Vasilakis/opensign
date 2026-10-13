# OpenSign Security Audit Report (Cloudflare Security Audit Harness)

**Audit Execution Date:** October 14, 2026  
**Auditor Framework:** `cloudflare/security-audit-skill` (v1.0.0)  
**Target Repository:** `opensign` (`https://github.com/Rafail-Vasilakis/opensign`)  
**Commit / Source Ref:** `c1c8a8c` (Branch: `main`)  
**Status:** Audit Complete — 4 Findings Confirmed (1 High, 1 Medium, 2 Low)  
**Coverage Ledger Units:** 4 Units Validated (`PASS`)  
**Findings Schema Validation:** 4 Findings Validated (`PASS`)  

---

## Executive Summary

A full adversarial security audit was performed against OpenSign using the Cloudflare Security Audit methodology. Reconnaissance mapped entry surfaces across authentication, envelope signing, multi-tenant boundaries, PDF vector processing, and audit trail generation.

The audit verified **zero remote code execution (RCE)** and **zero arbitrary file write / path traversal** vulnerabilities in the PDF and file storage pipeline. The core cryptographic sealing and audit trail hashing mechanisms (`pdfEngine.js`) demonstrate robust integrity protection.

However, the audit confirmed **one High-Severity authorization bypass** in the recipient passcode enforcement mechanism, **one Medium-Severity credential storage weakness**, and **two Low-Severity hardening issues** (HTML template injection and duplicate route definition).

---

## Findings Matrix

| Finding ID | Severity | Category | Title | Status |
| :--- | :--- | :--- | :--- | :--- |
| **OPENSIGN-SEC-001** | **HIGH** | Broken Access Control / IDOR | Passcode Protection Bypass and Unauthenticated Document Disclosure via Direct API Endpoints | **Confirmed & Verified** |
| **OPENSIGN-SEC-002** | **MEDIUM** | Cryptographic Weakness | Weak Password Storage Using Fast Static Salted Single-Iteration SHA-256 | **Confirmed & Verified** |
| **OPENSIGN-SEC-003** | **LOW** | Injection / Client-Side | HTML Injection in Transactional Notification Email Templates | **Confirmed & Verified** |
| **OPENSIGN-SEC-004** | **LOW** | Maintainability & Route Shadowing | Duplicate Shadowed Unauthenticated Document Deletion Route Handler | **Confirmed & Verified** |

---

## Detailed Findings & Evidence

### 1. [OPENSIGN-SEC-001] Passcode Protection Bypass via Direct Endpoints
- **Severity:** **HIGH** (Likelihood: High | Impact: High)
- **Vulnerable Files:** `server.js#L343-L372`, `server.js#L404-435`
- **Description:**  
  When an envelope is protected with a sender-specified access PIN (`doc.accessCode`), the client-side UI (`public/sign.js`) prompts the user for a PIN before rendering the document. However:
  1. `GET /api/documents/:id` sends the entire `doc.content` (the full legal agreement text), recipient emails, and audit log to the browser before the PIN is entered. Only the `accessCode` attribute was deleted from the returned JSON.
  2. `GET /api/documents/:id/pdf` directly downloads the full PDF binary with zero passcode check.
- **Observed Proof of Concept:**
  ```bash
  # Even though document has accessCode: "supersecret99"
  curl http://localhost:3000/api/documents/doc_e87388fad2f5
  # Response: HTTP 200 with full contract body
  curl http://localhost:3000/api/documents/doc_e87388fad2f5/pdf
  # Response: HTTP 200 with complete "%PDF-" binary stream
  ```
- **Remediation:**  
  In `GET /api/documents/:id`, check if `doc.accessCode` is set. If the request does not provide an authorized sender token or verified passcode token/header, redact `content` and `fields`. Similarly, require passcode verification before streaming `/api/documents/:id/pdf`.

---

### 2. [OPENSIGN-SEC-002] Weak Password Storage with Static Salt
- **Severity:** **MEDIUM** (Likelihood: Low | Impact: High)
- **Vulnerable File:** `authService.js#L13-L15`
- **Description:**  
  `authService.js` hashes passwords with single-iteration SHA-256 and a static salt string (`_opensign_salt_2026`). Single SHA-256 has zero memory hardness and can be computed at billions of hashes per second using standard GPUs if `data/users.json` is exposed.
- **Remediation:**  
  Replace with Node.js built-in `crypto.scryptSync(password, salt, 64)` using unique 16-byte random salts per user.

---

### 3. [OPENSIGN-SEC-003] HTML Injection in Email Notification Templates
- **Severity:** **LOW** (Likelihood: Medium | Impact: Low)
- **Vulnerable File:** `emailService.js#L80-87`
- **Description:**  
  User-supplied parameters `signer.name` and `doc.title` are interpolated directly into HTML email strings (`Hello <strong>${signer.name}</strong>`) without HTML entity escaping. A sender could craft a document title containing HTML markup to inject unauthorized styling or buttons into recipient inboxes.
- **Remediation:**  
  Add an `escapeHtml()` utility to encode `&`, `<`, `>`, `"`, and `'` before rendering email templates.

---

### 4. [OPENSIGN-SEC-004] Duplicate Shadowed Document Deletion Route
- **Severity:** **LOW** (Likelihood: Low | Impact: Medium)
- **Vulnerable File:** `server.js#L1029`
- **Description:**  
  A second `app.delete('/api/documents/:id')` route handler exists without `requireAuth`. While currently shadowed by line 568, having duplicate handlers creates latent security risks during refactoring.
- **Remediation:**  
  Delete the duplicate route at line 1029.

---

## Verification & Remediation Status
All findings have been independently verified against the running server. Fixes can now be applied directly to ensure OpenSign achieves an A+ security posture.
