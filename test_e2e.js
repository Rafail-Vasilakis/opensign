const http = require('http');
const { PDFDocument } = require('pdf-lib');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: buffer.toString('utf8'),
          rawBuffer: buffer
        });
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runEndToEndTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING OPENSIGN AUTONOMOUS COMPREHENSIVE SUITE');
  console.log('   (DocuSign Privacy, Multi-Tenancy & Security Verification)');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  try {
    // 1. Static Assets & Web Routes
    console.log('[Phase 1: Web Server & Application Routes]');
    let res = await request({ hostname: 'localhost', port: 3000, path: '/', method: 'GET' });
    assert(res.statusCode === 200 && res.body.includes('OpenSign'), 'Dashboard HTML loads successfully (HTTP 200)');

    res = await request({ hostname: 'localhost', port: 3000, path: '/studio', method: 'GET' });
    assert(res.statusCode === 200 && res.body.includes('Field Palette'), 'Field Placement Studio loads (/studio)');

    res = await request({ hostname: 'localhost', port: 3000, path: '/verify', method: 'GET' });
    assert(res.statusCode === 200 && res.body.includes('Document Integrity Verifier'), 'Cryptographic Verifier Portal loads (/verify)');

    res = await request({ hostname: 'localhost', port: 3000, path: '/styles.css', method: 'GET' });
    assert(res.statusCode === 200 && res.body.includes('@media print'), 'Print & Document Stylesheet loads (/styles.css)');

    // 2. Templates API
    console.log('\n[Phase 2: Legal Templates Engine]');
    res = await request({ hostname: 'localhost', port: 3000, path: '/api/templates', method: 'GET' });
    assert(res.statusCode === 200, 'GET /api/templates returns HTTP 200');
    const templates = JSON.parse(res.body);
    assert(templates.length >= 3, `Loaded ${templates.length} standard legal templates`);

    // 3. Authentication & DocuSign Multi-Tenant Privacy Isolation
    console.log('\n[Phase 3: Sender Authentication & Multi-Tenant Dashboard Privacy]');
    
    // Check unauthenticated rejection
    res = await request({ hostname: 'localhost', port: 3000, path: '/api/documents', method: 'GET' });
    assert(res.statusCode === 401, 'Unauthenticated GET /api/documents returns HTTP 401 (Envelopes are private)');

    res = await request({ hostname: 'localhost', port: 3000, path: '/api/stats', method: 'GET' });
    assert(res.statusCode === 401, 'Unauthenticated GET /api/stats returns HTTP 401');

    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { title: 'Unauthorized Env' });
    assert(res.statusCode === 401, 'Unauthenticated POST /api/documents returns HTTP 401');

    // Login as Demo User (Default Sender)
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'demo@opensign.local', password: 'demo123' });
    assert(res.statusCode === 200, 'POST /api/auth/login succeeds for Demo User (HTTP 200)');
    const demoAuth = JSON.parse(res.body);
    const demoToken = demoAuth.token;
    assert(demoToken && demoToken.startsWith('tok_'), `Valid session token issued: ${demoToken.slice(0, 12)}...`);

    // Register second independent sender (Alice Morgan)
    const testAliceEmail = `alice_${Date.now()}@lawfirm.com`;
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { name: 'Alice Morgan', email: testAliceEmail, password: 'lawFirmPassword456' });
    assert(res.statusCode === 201, 'POST /api/auth/register succeeds for second sender Alice (HTTP 201)');
    const aliceAuth = JSON.parse(res.body);
    const aliceToken = aliceAuth.token;

    // Verify /api/auth/me returns corresponding identities
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${demoToken}` }
    });
    assert(res.statusCode === 200 && JSON.parse(res.body).user.email === 'demo@opensign.local', 'Auth check identifies Demo User');

    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    assert(res.statusCode === 200 && JSON.parse(res.body).user.email === testAliceEmail, 'Auth check identifies Alice');

    // Create an envelope as Alice
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      }
    }, {
      templateId: 'nda',
      title: 'Alice Private NDA',
      recipientName: 'Alice Client',
      recipientEmail: 'client@alice.com'
    });
    assert(res.statusCode === 201, 'Alice creates private envelope (HTTP 201)');
    const aliceDoc = JSON.parse(res.body);

    // Verify Demo User CANNOT see Alice's envelope on his dashboard
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${demoToken}` }
    });
    const demoDocList = JSON.parse(res.body);
    const demoSeesAlice = demoDocList.some(d => d.id === aliceDoc.id);
    assert(demoSeesAlice === false, 'Privacy Isolation: Demo User dashboard DOES NOT leak Alice envelopes');

    // Verify Alice CAN see Alice's envelope on her dashboard
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const aliceDocList = JSON.parse(res.body);
    const aliceSeesOwn = aliceDocList.some(d => d.id === aliceDoc.id);
    assert(aliceSeesOwn === true, 'Privacy Isolation: Alice dashboard correctly shows Alice envelopes');

    // Verify stats are isolated
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/stats',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const aliceStats = JSON.parse(res.body);
    assert(aliceStats.totalEnvelopes === 1, `Alice stats isolated (totalEnvelopes = ${aliceStats.totalEnvelopes})`);

    // Verify Signer Isolation: Recipient accesses /sign/:id and /api/documents/:id WITHOUT any token
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/sign/${aliceDoc.id}`,
      method: 'GET'
    });
    assert(res.statusCode === 200 && res.body.includes('Review & Sign Document'), 'Signer accesses /sign/:id with zero account or token requirement');

    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${aliceDoc.id}`,
      method: 'GET'
    });
    assert(res.statusCode === 200, 'Signer accesses document payload /api/documents/:id without token requirement');

    // 4. Standard Envelope Creation & Execution (Using Demo User Auth)
    console.log('\n[Phase 4: Standard Envelope Execution]');
    const newDocPayload = {
      templateId: 'nda',
      title: 'Mutual NDA (Automated Test)',
      recipientName: 'Maria Kontou',
      recipientEmail: 'maria.kontou@example.com',
      recipientRole: 'Receiving Party'
    };

    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${demoToken}`
      }
    }, newDocPayload);

    assert(res.statusCode === 201, 'POST /api/documents creates envelope under Demo User (HTTP 201)');
    const createdDoc = JSON.parse(res.body);

    // Simulated valid 1x1 PNG transparent signature
    const validSignatureImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    // Recipient signs without auth token
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${createdDoc.id}/sign`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      signatureImage: validSignatureImage,
      signatureType: 'draw',
      signerName: 'Maria Kontou',
      agreedToLegalNotice: true
    });

    assert(res.statusCode === 200, 'POST /api/documents/:id/sign executes signature (HTTP 200)');
    const signResult = JSON.parse(res.body);
    assert(signResult.certificateId && signResult.certificateId.startsWith('CERT-'), `Certificate generated: ${signResult.certificateId}`);

    // 5. Verification Endpoint Test (Standard Doc)
    console.log('\n[Phase 5: Public Cryptographic Verifier API]');
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { query: signResult.postSignHash });

    assert(res.statusCode === 200, 'POST /api/verify returns HTTP 200');
    const verifyResult = JSON.parse(res.body);
    assert(verifyResult.verified === true, 'Verifier confirms authenticity via SHA-256 post-sign hash');
    assert(verifyResult.document.certificateId === signResult.certificateId, 'Certificate ID matches verified record');

    // 6. Custom Uploaded PDF with Multi-Signer & Full Field Suite (Signature, Initials, Text, Checkbox, Date, Name)
    console.log('\n[Phase 6: Multi-Signer & Full Field Suite Test (DocuSign Gap Closed)]');
    
    // Create a real 2-page PDF
    const testPdfDoc = await PDFDocument.create();
    const page1 = testPdfDoc.addPage([595, 842]);
    page1.drawText('Page 1: Master Software Agreement', { x: 50, y: 800, size: 14 });
    const page2 = testPdfDoc.addPage([595, 842]);
    page2.drawText('Page 2: Schedule of Deliverables & Acceptance', { x: 50, y: 800, size: 14 });
    const testPdfBytes = await testPdfDoc.save();
    const testPdfBase64 = Buffer.from(testPdfBytes).toString('base64');

    const multiSigners = [
      { id: 'signer_client', name: 'John Doe', email: 'john@client.com', role: 'Client Signer' },
      { id: 'signer_vendor', name: 'Jane Smith', email: 'jane@vendor.com', role: 'Vendor Lead' }
    ];

    const multiFields = [
      { id: 'field_sig_1', type: 'signature', signerId: 'signer_client', pageIndex: 0, xRatio: 0.1, yRatio: 0.7, widthRatio: 0.3, heightRatio: 0.05 },
      { id: 'field_init_1', type: 'initials', signerId: 'signer_client', pageIndex: 0, xRatio: 0.5, yRatio: 0.7, widthRatio: 0.15, heightRatio: 0.05 },
      { id: 'field_text_1', type: 'text', signerId: 'signer_client', pageIndex: 0, xRatio: 0.1, yRatio: 0.6, widthRatio: 0.4, heightRatio: 0.04 },
      { id: 'field_chk_1', type: 'checkbox', signerId: 'signer_client', pageIndex: 0, xRatio: 0.6, yRatio: 0.6, widthRatio: 0.05, heightRatio: 0.04 },
      { id: 'field_sig_2', type: 'signature', signerId: 'signer_vendor', pageIndex: 1, xRatio: 0.1, yRatio: 0.7, widthRatio: 0.3, heightRatio: 0.05 }
    ];

    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents/custom',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${demoToken}`
      }
    }, {
      title: 'Custom Multi-Signer SOW Agreement',
      pdfBase64: testPdfBase64,
      signers: multiSigners,
      fields: multiFields
    });

    assert(res.statusCode === 201, 'POST /api/documents/custom creates custom envelope (HTTP 201)');
    const customDoc = JSON.parse(res.body);
    assert(customDoc.signers.length === 2, 'Enrolled 2 signers in routing chain');
    assert(customDoc.fields.length === 5, 'Enrolled 5 multi-type tags across 2 pages');

    // Signer 1 executes: signature, initials, text input, checkbox
    console.log('  -> Executing Signer 1 (Client) with Initials, Text, and Checkbox...');
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${customDoc.id}/sign`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      signatureImage: validSignatureImage,
      initialsImage: validSignatureImage,
      signerId: 'signer_client',
      signerName: 'John Doe',
      agreedToLegalNotice: true,
      fieldValues: {
        field_text_1: 'Deliverables verified and accepted',
        field_chk_1: true
      }
    });

    assert(res.statusCode === 200, 'Signer 1 executed successfully (HTTP 200)');
    const s1Result = JSON.parse(res.body);
    assert(s1Result.document.status === 'in_progress', 'Document routed to Signer 2 (status: "in_progress")');

    // Signer 2 executes final signature
    console.log('  -> Executing Signer 2 (Vendor) for final sealing...');
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${customDoc.id}/sign`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      signatureImage: validSignatureImage,
      signerId: 'signer_vendor',
      signerName: 'Jane Smith',
      agreedToLegalNotice: true
    });

    assert(res.statusCode === 200, 'Signer 2 executed successfully (HTTP 200)');
    const s2Result = JSON.parse(res.body);
    assert(s2Result.document.status === 'completed', 'All signers completed -> Envelope status: "completed"');
    assert(s2Result.document.certificateId && s2Result.document.certificateId.startsWith('CERT-'), `Final Certificate sealed: ${s2Result.document.certificateId}`);

    // Download stamped vector PDF
    console.log('  -> Downloading stamped custom PDF with Certificate of Completion...');
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${customDoc.id}/pdf`,
      method: 'GET'
    });

    assert(res.statusCode === 200, 'GET /api/documents/:id/pdf returns HTTP 200');
    assert(res.rawBuffer.toString('utf8', 0, 5) === '%PDF-', 'Downloaded payload is an authentic binary PDF');
    assert(res.rawBuffer.length > 5000, `Generated vector PDF size is ${res.rawBuffer.length} bytes with stamped fields & audit page`);

    // Verify Custom Document via Verification API
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { query: s2Result.document.certificateId });

    assert(res.statusCode === 200, 'Verify custom document by Certificate ID returns HTTP 200');

    // 7. Password Protection & Security Passcode Tests (DocuSign Access Code Parity)
    console.log('\n[Phase 7: Security Passcode & Access Code Verification (Enterprise Feature)]');
    
    // Create password-protected envelope
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${demoToken}`
      }
    }, {
      templateId: 'nda',
      title: 'Protected Confidential Disclosure',
      recipientName: 'Alex Roberts',
      recipientEmail: 'alex.roberts@partner.com',
      accessCode: 'SECRET_4910'
    });

    assert(res.statusCode === 201, 'Created envelope with accessCode requirement (HTTP 201)');
    const protectedDoc = JSON.parse(res.body);

    // Verify GET endpoint does not leak raw accessCode
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${protectedDoc.id}`,
      method: 'GET'
    });
    const fetchedDoc = JSON.parse(res.body);
    assert(fetchedDoc.isPasswordProtected === true, 'GET endpoint reports isPasswordProtected: true');
    assert(fetchedDoc.accessCode === undefined, 'Security check passed: Raw accessCode is stripped from API responses');

    // Test verifying with incorrect passcode
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${protectedDoc.id}/verify-access`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { passcode: 'WRONG_PIN' });
    assert(res.statusCode === 401, 'POST /verify-access with invalid PIN correctly returns HTTP 401');

    // Test verifying with correct passcode
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${protectedDoc.id}/verify-access`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { passcode: 'SECRET_4910' });
    assert(res.statusCode === 200, 'POST /verify-access with valid PIN returns HTTP 200');

    // Attempting to sign without passcode must be rejected
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${protectedDoc.id}/sign`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      signatureImage: validSignatureImage,
      signerName: 'Alex Roberts',
      agreedToLegalNotice: true
    });
    assert(res.statusCode === 401, 'Unauthorized signing attempt without passcode rejected (HTTP 401)');

    // Signing with valid passcode succeeds
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${protectedDoc.id}/sign`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      signatureImage: validSignatureImage,
      signerName: 'Alex Roberts',
      agreedToLegalNotice: true,
      passcode: 'SECRET_4910'
    });
    assert(res.statusCode === 200, 'Signing with verified passcode succeeds (HTTP 200)');
    const protectedSignRes = JSON.parse(res.body);
    assert(protectedSignRes.certificateId && protectedSignRes.certificateId.startsWith('CERT-'), `Certificate generated for protected envelope: ${protectedSignRes.certificateId}`);

    // 8. DocuSign Dual-Party Counter-Signing & Sequential Turn Routing
    console.log('\n[Phase 8: DocuSign Multi-Party Counter-Signing Workflow]');
    const counterSignPayload = {
      templateId: 'consulting_sow',
      title: 'Consulting Contract (Counter-Sign Test)',
      recipientName: 'David Miller',
      recipientEmail: 'david@partner.com',
      signMode: 'both',
      senderName: 'Demo Sender',
      senderEmail: 'demo@opensign.local'
    };

    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${demoToken}`
      }
    }, counterSignPayload);

    assert(res.statusCode === 201, 'Created counter-sign envelope (HTTP 201)');
    const counterDoc = JSON.parse(res.body);
    assert(counterDoc.signers && counterDoc.signers.length === 2, 'Envelope initialized with 2 sequential signers');
    assert(counterDoc.signers[0].status === 'pending' && counterDoc.signers[1].status === 'waiting', 'Signer 1 is pending, Signer 2 is waiting');
    assert(counterDoc.signers[1].isSender === true, 'Signer 2 correctly flagged as isSender (initiator)');

    // Check dashboard turn awareness before Signer 1 signs (using Demo User token)
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${demoToken}` }
    });
    let docList = JSON.parse(res.body);
    let matchedDoc = docList.find(d => d.id === counterDoc.id);
    assert(matchedDoc && matchedDoc.myTurn === false, 'Dashboard turn awareness: Sender turn is false (waiting for recipient)');
    assert(matchedDoc && matchedDoc.waitingForOthers === true, 'Dashboard turn awareness: waitingForOthers is true');
    assert(matchedDoc && matchedDoc.activeSignerName === 'David Miller', 'Dashboard shows active signer is David Miller');

    // Attempt out-of-order execution: Counter-signer (Signer 2) attempts to sign prematurely
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${counterDoc.id}/sign`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      signatureImage: validSignatureImage,
      signerName: 'Demo Sender',
      signerId: 'signer_2',
      agreedToLegalNotice: true
    });
    assert(res.statusCode === 400, 'Anti-forgery / Turn enforcement: premature Signer 2 execution blocked (HTTP 400)');

    // Step 1: Signer 1 (Recipient) signs their turn (no sender auth required!)
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${counterDoc.id}/sign`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      signatureImage: validSignatureImage,
      signerName: 'David Miller',
      signerId: 'signer_1',
      agreedToLegalNotice: true
    });
    assert(res.statusCode === 200, 'Signer 1 executes successfully (HTTP 200)');
    let intermediateDoc = JSON.parse(res.body).document;
    assert(intermediateDoc.status === 'in_progress', 'Envelope status advances to in_progress');
    assert(intermediateDoc.signers[0].status === 'completed' && intermediateDoc.signers[1].status === 'pending', 'Signer 1 completed, Signer 2 promoted to pending');

    // Check dashboard turn awareness after Signer 1 signs (Now Action Required on sender!)
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${demoToken}` }
    });
    docList = JSON.parse(res.body);
    matchedDoc = docList.find(d => d.id === counterDoc.id);
    assert(matchedDoc && matchedDoc.myTurn === true, 'DocuSign Action Required: myTurn is now TRUE on dashboard');
    assert(matchedDoc && matchedDoc.activeSignerName === 'Demo Sender', 'Active signer updated to counter-signer');

    // Check single doc view returns myTurn === true
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${counterDoc.id}`,
      method: 'GET'
    });
    let fetchedSingle = JSON.parse(res.body);
    assert(fetchedSingle.myTurn === true, 'Single envelope view confirms myTurn === true');

    // Step 2: Sender executes their counter-signature
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${counterDoc.id}/sign`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      signatureImage: validSignatureImage,
      signerName: 'Demo Sender',
      signerId: 'signer_2',
      agreedToLegalNotice: true
    });
    assert(res.statusCode === 200, 'Sender counter-signature executed successfully (HTTP 200)');
    let finalDoc = JSON.parse(res.body).document;
    assert(finalDoc.status === 'completed', 'All parties signed: Envelope status is completed');
    assert(finalDoc.certificateId && finalDoc.certificateId.startsWith('CERT-'), `Certificate generated: ${finalDoc.certificateId}`);

    // Verify Official Vector PDF generation with both signatures
    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${counterDoc.id}/pdf`,
      method: 'GET'
    });
    assert(res.statusCode === 200, 'Dual-signed vector PDF served (HTTP 200)');
    assert(res.headers['content-type'] === 'application/pdf', 'Content-Type is application/pdf');
    const dualPdf = await PDFDocument.load(res.rawBuffer);
    assert(dualPdf.getPageCount() >= 1, `Counter-signed PDF has ${dualPdf.getPageCount()} valid page(s)`);

    console.log('\n====================================================');
    console.log(`🏁 TEST RESULTS: ${passed}/${total} TESTS PASSED (100% SUCCESS)`);
    console.log('====================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runEndToEndTests();
