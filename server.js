const fs = require('fs');
const path = require('path');

// Auto-load .env configuration if present (zero dependencies)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  } catch (_) {}
}

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { generatePixelPerfectPDF, generatePixelPerfectPDFBuffer } = require('./pdfGenerator');
const { stampPdfAndAppendCertificate } = require('./pdfEngine');
const emailService = require('./emailService');
const authService = require('./authService');

// Catch any unhandled exceptions to keep server rock-solid
process.on('uncaughtException', (err) => {
  console.error('Unhandled Exception caught safely in OpenSign server:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection caught safely:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'documents.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Dedicated DocuSign Signer Portal Route
app.get('/sign/:id', (req, res, next) => {
  if (req.params.id.includes('.')) return next();
  res.sendFile(path.join(__dirname, 'public', 'sign.html'));
});

// Visual Drag & Drop Field Placement Studio Route
app.get('/studio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'studio.html'));
});

// Cryptographic Document Verification Route
app.get('/verify', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

// Standard Legal Templates
const TEMPLATES = [
  {
    id: 'nda',
    title: 'Mutual Non-Disclosure Agreement (NDA)',
    category: 'Confidentiality',
    description: 'Standard reciprocal confidentiality agreement protecting trade secrets and proprietary data.',
    defaultRecipientRole: 'Receiving Party',
    content: `MUTUAL NON-DISCLOSURE AND CONFIDENTIALITY AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of the date of electronic signature below ("Effective Date"), by and between:

DISCLOSING PARTY:
OpenSign Technologies / Initiator

AND

RECEIVING PARTY:
{{recipient_name}} (Email: {{recipient_email}})

1. PURPOSE
The parties wish to explore a business opportunity or collaboration of mutual interest and, in connection therewith, may disclose to each other certain confidential technical, financial, and business information.

2. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means all non-public information disclosed by one party ("Disclosing Party") to the other party ("Receiving Party"), whether orally or in writing, that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure.

3. OBLIGATIONS OF RECEIVING PARTY
The Receiving Party agrees to:
(a) Protect and safeguard the Disclosing Party's Confidential Information with at least the same degree of care it uses to protect its own sensitive information, but in no case less than a reasonable standard of care;
(b) Not use Confidential Information for any purpose outside the scope of this Agreement;
(c) Disclose Confidential Information only to employees, contractors, and legal/financial advisors who have a need to know and are bound by confidentiality obligations at least as restrictive as those herein.

4. TERM AND SURVIVAL
This Agreement shall govern disclosures made for a period of two (2) years from the Effective Date. Confidentiality obligations regarding trade secrets shall survive indefinitely.

5. GOVERNING LAW & JURISDICTION
This Agreement shall be governed by and construed in accordance with the laws applicable to commercial electronic contracts under the ESIGN Act and relevant state/provincial laws.

IN WITNESS WHEREOF, the Receiving Party has executed this Agreement electronically as verified below.`
  },
  {
    id: 'consulting_sow',
    title: 'Software Development & Consulting SOW',
    category: 'Services',
    description: 'Statement of work for independent software engineering, milestones, and deliverables.',
    defaultRecipientRole: 'Consultant / Developer',
    content: `STATEMENT OF WORK & SOFTWARE CONSULTING AGREEMENT

This Consulting Agreement ("Agreement") is executed as of the signing date below between the Client and the Consultant identified as:

CONSULTANT / CONTRACTOR:
Name: {{recipient_name}}
Email: {{recipient_email}}

1. SCOPE OF SERVICES
The Consultant agrees to perform custom software engineering, architectural review, and technical deliverables as mutually agreed upon in ongoing sprint specifications.

2. INDEPENDENT CONTRACTOR STATUS
Consultant is an independent contractor and not an employee or agent of the Client. Consultant retains full autonomy over the hours and manner in which the deliverables are produced.

3. PAYMENT TERMS
Invoices shall be submitted monthly or upon accepted milestone deliverables, payable within net thirty (30) days via electronic funds transfer or designated payment gateway.

4. INTELLECTUAL PROPERTY RIGHTS
Upon receipt of full payment, all custom source code, documentation, scripts, and deliverables developed specifically under this Agreement shall become the sole and exclusive property of the Client ("Work Made for Hire").

5. WARRANTIES & INDEMNITY
Consultant warrants that all code produced is original and does not infringe upon any third-party patents, copyrights, or proprietary trade secrets.

Agreed and electronically signed by the parties:`
  },
  {
    id: 'ip_assignment',
    title: 'Proprietary Information & IP Assignment Agreement',
    category: 'Intellectual Property',
    description: 'Protects company ownership over intellectual property, patents, and created assets.',
    defaultRecipientRole: 'Assignor',
    content: `PROPRIETARY INFORMATION AND INVENTIONS ASSIGNMENT AGREEMENT

This Agreement is made by the undersigned ("Assignor") in favor of the Company:

ASSIGNOR:
Full Legal Name: {{recipient_name}}
Contact Email: {{recipient_email}}

1. ASSIGNMENT OF INVENTIONS
Assignor hereby irrevocably assigns and transfers to the Company all right, title, and interest worldwide in and to any and all inventions, designs, source code, workflows, algorithms, and derivative works conceived, created, or reduced to practice during the term of association with the Company.

2. WAIVER OF MORAL RIGHTS
To the fullest extent permitted by applicable law, Assignor unconditionally waives any moral rights, rights of attribution, or integrity rights regarding works assigned hereunder.

3. COOPERATION IN PATENT FILINGS
Assignor agrees to execute and deliver such further instruments and provide reasonable assistance as the Company may deem necessary to perfect, prosecute, or defend its rights in any assigned patents or copyrights.

Signed and certified electronically below:`
  }
];

// Helper: Database Access
function getDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    // Seed initial demo document
    const seedId = 'doc_' + crypto.randomBytes(6).toString('hex');
    const seedContent = TEMPLATES[0].content
      .replace(/{{recipient_name}}/g, 'Alex Rivera')
      .replace(/{{recipient_email}}/g, 'alex.rivera@example.com');
    
    const preSignHash = crypto.createHash('sha256').update(seedContent).digest('hex');

    const seedDoc = {
      id: seedId,
      title: 'Mutual Non-Disclosure Agreement (Demo)',
      templateId: 'nda',
      recipientName: 'Alex Rivera',
      recipientEmail: 'alex.rivera@example.com',
      recipientRole: 'Receiving Party',
      status: 'pending', // 'pending' | 'completed'
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      content: seedContent,
      preSignHash: preSignHash,
      signatureData: null,
      signedAt: null,
      auditLog: [
        {
          event: 'ENVELOPE_CREATED',
          timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
          ip: '127.0.0.1',
          userAgent: 'OpenSign System/1.0',
          details: 'Envelope generated from template: nda'
        }
      ]
    };

    const initialData = { documents: [seedDoc] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
    return initialData;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database, resetting:', err);
    return { documents: [] };
  }
}

function saveDatabase(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Calculate SHA-256 Digest
function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// ==========================================
// SENDER AUTHENTICATION (DocuSign Multi-Tenant Privacy)
// ==========================================

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  const user = authService.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please log in to your sender account.' });
  }
  req.user = user;
  next();
}

app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    const result = authService.registerUser(name, email, password);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const result = authService.loginUser(email, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  authService.logoutUser(token);
  res.json({ success: true });
});

// ==========================================
// API ROUTES
// ==========================================

// Get Templates
app.get('/api/templates', (req, res) => {
  res.json(TEMPLATES);
});

// Get Summary Metrics & Savings (Private to Logged-in Sender)
app.get('/api/stats', requireAuth, (req, res) => {
  const db = getDatabase();
  const docs = db.documents.filter(d => d.userId === req.user.id || (!d.userId && req.user.id === 'usr_default_demo'));
  const completed = docs.filter(d => d.status === 'completed').length;
  const pending = docs.filter(d => d.status === 'pending').length;
  const estimatedSavings = completed * 5 + 40; 

  res.json({
    totalEnvelopes: docs.length,
    completedEnvelopes: completed,
    pendingEnvelopes: pending,
    estimatedSavingsDollars: estimatedSavings
  });
});

// List Envelopes (Private to Logged-in Sender)
app.get('/api/documents', requireAuth, (req, res) => {
  const db = getDatabase();
  const userDocs = db.documents.filter(d => d.userId === req.user.id || (!d.userId && req.user.id === 'usr_default_demo'));
  const list = userDocs.map(d => {
    const activeSigner = (d.signers && d.signers.find(s => s.status === 'pending')) || { name: d.recipientName, email: d.recipientEmail, status: d.status };
    const myTurn = d.signers && d.signers.some(s => s.status === 'pending' && s.isSender);
    const waitingForOthers = d.signers && d.signers.some(s => s.status === 'pending' && !s.isSender);

    return {
      id: d.id,
      title: d.title,
      recipientName: d.recipientName,
      recipientEmail: d.recipientEmail,
      activeSignerName: activeSigner.name,
      activeSignerEmail: activeSigner.email,
      status: d.status,
      myTurn: !!myTurn,
      waitingForOthers: !!waitingForOthers,
      signMode: d.signMode || (d.signers && d.signers.length > 1 ? 'both' : 'others'),
      isPasswordProtected: !!d.accessCode,
      isCustomPdf: !!d.isCustomPdf,
      signers: d.signers || [{ name: d.recipientName, email: d.recipientEmail, status: d.status, order: 1 }],
      createdAt: d.createdAt,
      signedAt: d.signedAt
    };
  });
  res.json(list.reverse());
});

// Get Single Document with Audit Trail
app.get('/api/documents/:id', (req, res) => {
  const db = getDatabase();
  const doc = db.documents.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Envelope not found' });
  }

  // Record viewed event if pending
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const hasViewedLog = doc.auditLog.some(l => l.event === 'ENVELOPE_VIEWED' && l.ip === clientIp);
  
  if (!hasViewedLog && doc.status === 'pending') {
    doc.auditLog.push({
      event: 'ENVELOPE_VIEWED',
      timestamp: new Date().toISOString(),
      ip: clientIp,
      userAgent: req.headers['user-agent'] || 'Unknown Browser',
      details: 'Recipient opened envelope for review'
    });
    saveDatabase(db);
  }

  // Return safe copy without exposing secret accessCode to browser DevTools
  const safeDoc = { ...doc };
  safeDoc.isPasswordProtected = !!doc.accessCode;
  const myTurn = doc.signers && doc.signers.some(s => s.status === 'pending' && s.isSender);
  safeDoc.myTurn = !!myTurn;
  delete safeDoc.accessCode;
  res.json(safeDoc);
});

// Verify Access Passcode / Unlock Envelope
app.post('/api/documents/:id/verify-access', (req, res) => {
  const { passcode } = req.body;
  const db = getDatabase();
  const doc = db.documents.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Envelope not found' });
  }

  if (!doc.accessCode) {
    return res.json({ success: true, message: 'No passcode required' });
  }

  if ((passcode || '').trim() === doc.accessCode) {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    doc.auditLog.push({
      event: 'ACCESS_PASSCODE_VERIFIED',
      timestamp: new Date().toISOString(),
      ip: clientIp,
      userAgent: req.headers['user-agent'] || 'Unknown Browser',
      details: 'Recipient successfully unlocked document with security access code.'
    });
    saveDatabase(db);
    return res.json({ success: true, message: 'Access code verified' });
  } else {
    return res.status(401).json({ success: false, error: 'Incorrect access passcode. Please check with the sender.' });
  }
});

// Download Authentic Pixel-Perfect Vector PDF
app.get('/api/documents/:id/pdf', async (req, res) => {
  const db = getDatabase();
  const doc = db.documents.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).send('Document not found');
  }

  const safeFilename = (doc.title || 'Agreement')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 40) || 'document';

  if (doc.isCustomPdf) {
    const signedPath = path.join(UPLOAD_DIR, `${doc.id}_signed.pdf`);
    const originalPath = path.join(UPLOAD_DIR, `${doc.id}_original.pdf`);

    // If document is completed or has signed signers, stamp signatures on demand if signed file missing
    const hasCompletedSigners = doc.signers && doc.signers.some(s => s.status === 'completed' && s.signatureImage);
    if ((doc.status === 'completed' || hasCompletedSigners) && fs.existsSync(originalPath)) {
      try {
        const origBuffer = fs.readFileSync(originalPath);
        const stampedBuffer = await stampPdfAndAppendCertificate(origBuffer, doc);
        fs.writeFileSync(signedPath, stampedBuffer);
      } catch (err) {
        console.error('Error generating stamped PDF on download:', err);
      }
    }

    const targetPath = fs.existsSync(signedPath) ? signedPath : originalPath;
    if (fs.existsSync(targetPath)) {
      return res.download(targetPath, `${safeFilename}_Signed.pdf`);
    }
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}_Signed.pdf"`);

  try {
    generatePixelPerfectPDF(doc, res);
  } catch (err) {
    console.error('Error generating PDF:', err);
    if (!res.headersSent) {
      res.status(500).send('Error generating PDF');
    }
  }
});

// Clear All Documents for Current User
app.delete('/api/documents', requireAuth, (req, res) => {
  const db = getDatabase();
  db.documents = db.documents.filter(d => d.userId && d.userId !== req.user.id && (req.user.id !== 'usr_default_demo' || d.userId));
  saveDatabase(db);
  res.json({ success: true, message: 'All documents cleared' });
});

// Create New Envelope (Scoped to Logged-in Sender)
app.post('/api/documents', requireAuth, (req, res) => {
  const { title, templateId, customContent, recipientName, recipientEmail, recipientRole, accessCode, signMode, senderName, senderEmail } = req.body;

  if (!recipientName || !recipientEmail) {
    return res.status(400).json({ error: 'Recipient name and email are required' });
  }

  let finalContent = customContent;
  let finalTitle = title;

  if (templateId) {
    const template = TEMPLATES.find(t => t.id === templateId);
    if (template) {
      finalTitle = finalTitle || template.title;
      finalContent = template.content
        .replace(/{{recipient_name}}/g, recipientName)
        .replace(/{{recipient_email}}/g, recipientEmail);
    }
  }

  if (!finalContent) {
    return res.status(400).json({ error: 'Document content is empty' });
  }

  const docId = 'doc_' + crypto.randomBytes(6).toString('hex');
  const preSignHash = hashString(finalContent);
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const cleanAccessCode = accessCode && typeof accessCode === 'string' && accessCode.trim().length > 0 ? accessCode.trim() : null;

  const normalizedSigners = [
    {
      id: 'signer_1',
      name: recipientName.trim(),
      email: recipientEmail.trim(),
      role: recipientRole || 'First Signer / Recipient',
      order: 1,
      status: 'pending',
      signedAt: null,
      signatureImage: null
    }
  ];

  if (signMode === 'both') {
    normalizedSigners.push({
      id: 'signer_2',
      name: (senderName || req.user.name || 'Demo Sender').trim(),
      email: (senderEmail || req.user.email || 'demo@opensign.local').trim(),
      role: 'Counter-Signer / Initiator',
      order: 2,
      isSender: true,
      status: 'waiting',
      signedAt: null,
      signatureImage: null
    });
  }

  const newDoc = {
    id: docId,
    userId: req.user.id,
    title: finalTitle || 'Untitled Agreement',
    templateId: templateId || null,
    recipientName: recipientName.trim(),
    recipientEmail: recipientEmail.trim(),
    recipientRole: recipientRole || 'Signer',
    accessCode: cleanAccessCode,
    isPasswordProtected: !!cleanAccessCode,
    signMode: signMode || 'others',
    signers: normalizedSigners,
    status: 'pending',
    createdAt: new Date().toISOString(),
    content: finalContent,
    preSignHash: preSignHash,
    postSignHash: null,
    signatureData: null,
    signedAt: null,
    certificateId: null,
    auditLog: [
      {
        event: 'ENVELOPE_CREATED',
        timestamp: new Date().toISOString(),
        ip: clientIp,
        userAgent: req.headers['user-agent'] || 'Unknown Browser',
        details: `Created envelope (${signMode === 'both' ? 'Me and Others / Counter-Sign' : 'Only Others'}). SHA-256 Pre-Sign Checksum: ${preSignHash.slice(0, 16)}...`
      }
    ]
  };

  if (cleanAccessCode) {
    newDoc.auditLog.push({
      event: 'SECURITY_ACCESS_CODE_ENABLED',
      timestamp: new Date().toISOString(),
      ip: clientIp,
      userAgent: req.headers['user-agent'] || 'Unknown Browser',
      details: 'Envelope protected with recipient access code requirement.'
    });
  }

  const db = getDatabase();
  db.documents.push(newDoc);
  saveDatabase(db);

  // Dispatch DocuSign-style invitation email to Signer 1
  emailService.sendSignatureInvitation(newDoc, normalizedSigners[0], req.headers.host)
    .catch(err => console.error('[OpenSign Mailer] Error sending invitation:', err.message));

  res.status(201).json(newDoc);
});

// Delete Single Envelope (Scoped to Owner)
app.delete('/api/documents/:id', requireAuth, (req, res) => {
  const db = getDatabase();
  const index = db.documents.findIndex(d => d.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Envelope not found' });
  }
  const doc = db.documents[index];
  if (doc.userId && doc.userId !== req.user.id && req.user.id !== 'usr_default_demo') {
    return res.status(403).json({ error: 'Unauthorized to delete this envelope' });
  }
  db.documents.splice(index, 1);
  saveDatabase(db);
  res.json({ success: true, message: 'Envelope deleted' });
});

// Create Custom Envelope from Uploaded PDF with Field Coordinates & Multi-Signers
app.post('/api/documents/custom', requireAuth, (req, res) => {
  const { title, pdfBase64, signers, fields, accessCode } = req.body;

  if (!pdfBase64) {
    return res.status(400).json({ error: 'PDF file is required' });
  }

  if (!signers || !Array.isArray(signers) || signers.length === 0) {
    return res.status(400).json({ error: 'At least one signer is required' });
  }

  const docId = 'doc_custom_' + crypto.randomBytes(6).toString('hex');
  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  const preSignHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const cleanAccessCode = accessCode && typeof accessCode === 'string' && accessCode.trim().length > 0 ? accessCode.trim() : null;

  // Save original PDF
  const originalPdfPath = path.join(UPLOAD_DIR, `${docId}_original.pdf`);
  fs.writeFileSync(originalPdfPath, pdfBuffer);

  const normalizedSigners = signers.map((s, idx) => ({
    id: s.id || `signer_${idx + 1}`,
    name: (s.name || `Signer ${idx + 1}`).trim(),
    email: (s.email || '').trim(),
    role: s.role || `Signer ${idx + 1}`,
    order: idx + 1,
    status: idx === 0 ? 'pending' : 'waiting', // First signer starts pending, others wait
    signedAt: null,
    signatureImage: null
  }));

  const newDoc = {
    id: docId,
    userId: req.user.id,
    title: title || 'Custom Uploaded Agreement',
    isCustomPdf: true,
    recipientName: normalizedSigners[0].name,
    recipientEmail: normalizedSigners[0].email,
    accessCode: cleanAccessCode,
    isPasswordProtected: !!cleanAccessCode,
    signers: normalizedSigners,
    fields: fields || [],
    status: 'pending',
    createdAt: new Date().toISOString(),
    preSignHash: preSignHash,
    postSignHash: null,
    certificateId: null,
    auditLog: [
      {
        event: 'CUSTOM_PDF_ENVELOPE_CREATED',
        timestamp: new Date().toISOString(),
        ip: clientIp,
        userAgent: req.headers['user-agent'] || 'Unknown Browser',
        details: `Uploaded custom PDF (${(pdfBuffer.length / 1024).toFixed(1)} KB) with ${normalizedSigners.length} signers and ${fields ? fields.length : 0} placed fields.`
      }
    ]
  };

  if (cleanAccessCode) {
    newDoc.auditLog.push({
      event: 'SECURITY_ACCESS_CODE_ENABLED',
      timestamp: new Date().toISOString(),
      ip: clientIp,
      userAgent: req.headers['user-agent'] || 'Unknown Browser',
      details: 'Custom envelope protected with recipient access code requirement.'
    });
  }

  const db = getDatabase();
  db.documents.push(newDoc);
  saveDatabase(db);

  // Dispatch DocuSign-style invitation email to Signer 1
  emailService.sendSignatureInvitation(newDoc, normalizedSigners[0], req.headers.host)
    .catch(err => console.error('[OpenSign Mailer] Error sending custom invitation:', err.message));

  res.status(201).json(newDoc);
});

// Sign Document (Supports Multi-Signer Routing & Custom PDF Stamping)
app.post('/api/documents/:id/sign', async (req, res) => {
  const { signatureImage, signatureType, signerName, signerId, agreedToLegalNotice, initialsImage, fieldValues, passcode } = req.body;

  if (!signatureImage) {
    return res.status(400).json({ error: 'Signature data is required' });
  }

  if (!agreedToLegalNotice) {
    return res.status(400).json({ error: 'You must agree to the electronic signature legal consent' });
  }

  const db = getDatabase();
  const doc = db.documents.find(d => d.id === req.params.id);

  if (!doc) {
    return res.status(404).json({ error: 'Envelope not found' });
  }

  if (doc.accessCode && (passcode || '').trim() !== doc.accessCode) {
    return res.status(401).json({ error: 'Valid access passcode required to execute signature' });
  }

  if (doc.status === 'completed') {
    return res.status(400).json({ error: 'Document has already been signed and sealed' });
  }

  const signedTimestamp = new Date().toISOString();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';

  // Check if Multi-Signer Document
  if (doc.signers && Array.isArray(doc.signers) && doc.signers.length > 0) {
    let activeSigner = null;

    if (signerId) {
      const targetSigner = doc.signers.find(s => s.id === signerId);
      if (!targetSigner) {
        return res.status(404).json({ error: 'Signer not found on this envelope.' });
      }
      if (targetSigner.status === 'completed') {
        return res.status(400).json({ error: 'This signer has already signed the envelope.' });
      }
      if (targetSigner.status === 'waiting') {
        return res.status(400).json({ error: "It is not this signer's turn to sign yet. Waiting for preceding signers." });
      }
      activeSigner = targetSigner;
    } else {
      activeSigner = doc.signers.find(s => s.status === 'pending');
    }

    if (!activeSigner) {
      return res.status(400).json({ error: 'No active signing turn found for this document.' });
    }

    // Record this signer's execution
    activeSigner.signatureImage = signatureImage;
    if (initialsImage) activeSigner.initialsImage = initialsImage;
    activeSigner.signedAt = signedTimestamp;
    activeSigner.status = 'completed';
    activeSigner.signatureType = signatureType || 'draw';

    if (!doc.signatureData) {
      doc.signatureData = {
        image: activeSigner.signatureImage,
        type: activeSigner.signatureType || 'draw',
        signerName: activeSigner.name,
        signerEmail: activeSigner.email,
        ip: clientIp,
        userAgent: userAgent
      };
    }

    // Update field values if provided
    if (doc.fields && Array.isArray(doc.fields) && fieldValues && typeof fieldValues === 'object') {
      doc.fields.forEach(f => {
        if (fieldValues[f.id] !== undefined) {
          f.value = fieldValues[f.id];
        }
      });
    }

    doc.auditLog.push({
      event: 'SIGNER_COMPLETED',
      timestamp: signedTimestamp,
      ip: clientIp,
      userAgent: userAgent,
      details: `${activeSigner.name} (${activeSigner.email}) completed their electronic signature.`
    });

    // Check if there is a next waiting signer in the chain
    const nextSigner = doc.signers.find(s => s.status === 'waiting');
    if (nextSigner) {
      nextSigner.status = 'pending';
      doc.status = 'in_progress';
      doc.recipientName = nextSigner.name;
      doc.recipientEmail = nextSigner.email;

      doc.auditLog.push({
        event: 'ENVELOPE_ROUTED_TO_NEXT_SIGNER',
        timestamp: signedTimestamp,
        ip: '127.0.0.1',
        userAgent: 'OpenSign Routing Engine',
        details: `Next turn activated for Signer ${nextSigner.order}: ${nextSigner.name} (${nextSigner.email}).`
      });

      // Dispatch counter-sign action email to next signer
      emailService.sendCounterSignInvitation(doc, nextSigner, req.headers.host)
        .catch(err => console.error('[OpenSign Mailer] Error sending counter-sign invitation:', err.message));
    } else {
      // All signers have completed!
      doc.status = 'completed';
      doc.signedAt = signedTimestamp;
      doc.certificateId = 'CERT-' + crypto.randomBytes(8).toString('hex').toUpperCase();

      const postSignPayload = `${doc.id}::${signedTimestamp}::${doc.signers.map(s => s.email).join(',')}`;
      doc.postSignHash = hashString(postSignPayload);

      doc.auditLog.push({
        event: 'ALL_SIGNERS_COMPLETED',
        timestamp: signedTimestamp,
        ip: clientIp,
        userAgent: 'OpenSign Core Engine',
        details: `All ${doc.signers.length} signers executed agreement. Final Certificate ID: ${doc.certificateId}.`
      });
    }

    // If custom PDF, stamp signatures onto PDF bytes using pdf-lib!
    if (doc.isCustomPdf) {
      try {
        const origPath = path.join(UPLOAD_DIR, `${doc.id}_original.pdf`);
        if (fs.existsSync(origPath)) {
          const origBuffer = fs.readFileSync(origPath);
          const stampedBuffer = await stampPdfAndAppendCertificate(origBuffer, doc);
          const signedPath = path.join(UPLOAD_DIR, `${doc.id}_signed.pdf`);
          fs.writeFileSync(signedPath, stampedBuffer);
        }
      } catch (err) {
        console.error('Error stamping custom PDF:', err);
      }
    }

    // If completed, dispatch completion email to all parties with attached PDF
    if (doc.status === 'completed') {
      (async () => {
        try {
          let pdfBuf = null;
          if (doc.isCustomPdf) {
            const signedPath = path.join(UPLOAD_DIR, `${doc.id}_signed.pdf`);
            if (fs.existsSync(signedPath)) pdfBuf = fs.readFileSync(signedPath);
          } else {
            pdfBuf = await generatePixelPerfectPDFBuffer(doc);
          }
          await emailService.sendCompletionEmail(doc, pdfBuf, req.headers.host);
        } catch (err) {
          console.error('[OpenSign Mailer] Error dispatching multi-signer completion email:', err.message);
        }
      })();
    }

    saveDatabase(db);
    return res.json({
      success: true,
      certificateId: doc.certificateId,
      postSignHash: doc.postSignHash,
      document: doc
    });
  }

  // Standard Single-Signer Flow (Template Documents)
  const postSignPayload = `${doc.content}::${signatureImage.slice(0, 100)}::${signedTimestamp}::${doc.recipientEmail}`;
  const postSignHash = hashString(postSignPayload);
  const certificateId = 'CERT-' + crypto.randomBytes(8).toString('hex').toUpperCase();

  doc.status = 'completed';
  doc.signedAt = signedTimestamp;
  doc.postSignHash = postSignHash;
  doc.certificateId = certificateId;
  doc.signatureData = {
    image: signatureImage,
    type: signatureType || 'draw',
    signerName: signerName || doc.recipientName,
    signerEmail: doc.recipientEmail,
    ip: clientIp,
    userAgent: userAgent
  };

  doc.auditLog.push({
    event: 'DOCUMENT_ELECTRONICALLY_SIGNED',
    timestamp: signedTimestamp,
    ip: clientIp,
    userAgent: userAgent,
    details: `Signed via ${signatureType || 'canvas'}. Cryptographic SHA-256 Seal: ${postSignHash.slice(0, 16)}...`
  });

  doc.auditLog.push({
    event: 'CERTIFICATE_OF_COMPLETION_ISSUED',
    timestamp: signedTimestamp,
    ip: clientIp,
    userAgent: 'OpenSign Core Engine',
    details: `Tamper-evident Certificate ID: ${certificateId}. ESIGN & eIDAS compliant audit trail anchored.`
  });

  // Dispatch completion email with signed PDF attachment
  (async () => {
    try {
      const pdfBuf = await generatePixelPerfectPDFBuffer(doc);
      await emailService.sendCompletionEmail(doc, pdfBuf, req.headers.host);
    } catch (err) {
      console.error('[OpenSign Mailer] Error dispatching single completion email:', err.message);
    }
  })();

  saveDatabase(db);
  res.json({
    success: true,
    certificateId: certificateId,
    postSignHash: postSignHash,
    document: doc
  });
});

// Cryptographic Document Verification Endpoint
app.post('/api/verify', async (req, res) => {
  const { query, pdfBase64 } = req.body;
  const db = getDatabase();

  let targetHash = (query || '').trim().toLowerCase();
  let fileBuffer = null;

  if (pdfBase64) {
    try {
      const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
      fileBuffer = Buffer.from(cleanBase64, 'base64');
      targetHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toLowerCase();
    } catch (e) {
      return res.status(400).json({ error: 'Invalid PDF payload for verification' });
    }
  }

  if (!targetHash && !fileBuffer) {
    return res.status(400).json({ error: 'Please provide a file, Certificate ID, or SHA-256 checksum to verify' });
  }

  let matched = null;

  // 1. Direct hash, Certificate ID, or Document ID match
  if (targetHash) {
    matched = db.documents.find(d => {
      return (d.postSignHash && d.postSignHash.toLowerCase() === targetHash) ||
             (d.preSignHash && d.preSignHash.toLowerCase() === targetHash) ||
             (d.signedPdfHash && d.signedPdfHash.toLowerCase() === targetHash) ||
             (d.certificateId && d.certificateId.toLowerCase() === targetHash) ||
             (d.id && d.id.toLowerCase() === targetHash);
    });
  }

  // 2. If uploaded PDF file, check if hash matches any signed/original PDF stored on disk
  if (!matched && fileBuffer && fs.existsSync(UPLOAD_DIR)) {
    try {
      const uploadFiles = fs.readdirSync(UPLOAD_DIR);
      for (const f of uploadFiles) {
        const fPath = path.join(UPLOAD_DIR, f);
        try {
          const fBuf = fs.readFileSync(fPath);
          const fHash = crypto.createHash('sha256').update(fBuf).digest('hex').toLowerCase();
          if (fHash === targetHash) {
            const docId = f.replace(/_(signed|original)\.pdf$/, '');
            matched = db.documents.find(d => d.id === docId);
            if (matched) break;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // 3. Deep-inspect PDF streams and metadata for embedded Certificate ID or Document ID
  if (!matched && fileBuffer) {
    try {
      const { PDFDocument } = require('pdf-lib');
      const zlib = require('zlib');
      const pdfDoc = await PDFDocument.load(fileBuffer);
      
      let allDecoded = fileBuffer.toString('latin1') + ' ';
      const subject = pdfDoc.getSubject() || '';
      const keywords = pdfDoc.getKeywords() || '';
      const title = pdfDoc.getTitle() || '';
      allDecoded += subject + ' ' + keywords + ' ' + title + ' ';

      for (let i = 0; i < pdfDoc.getPageCount(); i++) {
        const page = pdfDoc.getPage(i);
        const ref = page.node.get(pdfDoc.context.obj('Contents'));
        if (ref) {
          const refs = Array.isArray(ref) ? ref : [ref];
          for (const r of refs) {
            const stream = pdfDoc.context.lookup(r);
            if (stream && stream.contents) {
              try {
                const inflated = zlib.inflateSync(Buffer.from(stream.contents)).toString('latin1');
                const decodedHex = inflated.replace(/<([0-9a-fA-F]+)>/g, (_, hex) => {
                  try { return Buffer.from(hex, 'hex').toString('latin1'); } catch (e) { return ''; }
                });
                allDecoded += ' ' + inflated + ' ' + decodedHex;
              } catch (_) {}
            }
          }
        }
      }

      for (const d of db.documents) {
        if (d.certificateId && allDecoded.includes(d.certificateId)) {
          matched = d;
          break;
        }
        if (d.id && allDecoded.includes(d.id)) {
          matched = d;
          break;
        }
        if (d.preSignHash && allDecoded.includes(d.preSignHash)) {
          matched = d;
          break;
        }
        if (d.postSignHash && allDecoded.includes(d.postSignHash)) {
          matched = d;
          break;
        }
      }
    } catch (e) {
      console.error('Error in verifier deep inspection:', e);
    }
  }

  if (matched) {
    // Only cache signedPdfHash if the document is actually completed!
    if (matched.status === 'completed' && !matched.signedPdfHash && fileBuffer) {
      matched.signedPdfHash = targetHash;
      saveDatabase(db);
    }

    return res.json({
      verified: true,
      hashMatched: targetHash || matched.postSignHash || matched.preSignHash,
      isCompleted: matched.status === 'completed',
      document: {
        id: matched.id,
        title: matched.title,
        status: matched.status,
        certificateId: matched.certificateId || null,
        preSignHash: matched.preSignHash,
        postSignHash: matched.postSignHash || null,
        signedAt: matched.signedAt || null,
        signers: matched.signers || [{ name: matched.recipientName, email: matched.recipientEmail, status: matched.status }],
        auditLog: matched.auditLog
      }
    });
  }

  return res.json({
    verified: false,
    hashComputed: targetHash,
    message: 'No cryptographic record found matching this document checksum or certificate ID.'
  });
});

// Delete Document
app.delete('/api/documents/:id', (req, res) => {
  const db = getDatabase();
  const initialLen = db.documents.length;
  db.documents = db.documents.filter(d => d.id !== req.params.id);

  if (db.documents.length === initialLen) {
    return res.status(404).json({ error: 'Envelope not found' });
  }

  saveDatabase(db);
  res.json({ success: true, message: 'Envelope deleted' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 OpenSign running at: http://localhost:${PORT}`);
  console.log(`📄 Open-source, self-hosted DocuSign alternative`);
  console.log(`🔒 Cryptographic SHA-256 audit trails active`);
  console.log(`=======================================================`);
});
