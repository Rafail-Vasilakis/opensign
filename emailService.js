const nodemailer = require('nodemailer');
const path = require('path');

// Configure Transporter from Environment or Fallback to Ethereal/Mock
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
    console.log(`[OpenSign Mailer] Configured active SMTP transport: ${host}:${port} (${user})`);
  } else {
    // Development/Local Mock Logger
    transporter = {
      sendMail: async (options) => {
        console.log('\n=============================================================');
        console.log('📧 [OpenSign Simulated Outbox / Email Dispatch]');
        console.log(`To:      ${options.to}`);
        console.log(`From:    ${options.from || process.env.SMTP_FROM || 'OpenSign <no-reply@opensign.local>'}`);
        console.log(`Subject: ${options.subject}`);
        if (options.attachments && options.attachments.length > 0) {
          console.log(`Attached: ${options.attachments.map(a => a.filename).join(', ')}`);
        }
        console.log('-------------------------------------------------------------');
        console.log(`Preview: ${(options.text || '').slice(0, 160)}...`);
        console.log('=============================================================\n');
        return { messageId: 'mock_' + Date.now(), accepted: [options.to] };
      }
    };
    console.log('[OpenSign Mailer] Running in local preview mode (No SMTP credentials configured). Emails logged to terminal.');
  }

  return transporter;
}

function getSenderAddress() {
  return process.env.SMTP_FROM || '"OpenSign Core" <no-reply@opensign.local>';
}

/**
 * Send Invitation to Sign (Primary Recipient)
 */
async function sendSignatureInvitation(doc, signer, reqHost) {
  const mailer = getTransporter();
  const baseUrl = process.env.BASE_URL || (reqHost ? `http://${reqHost}` : 'http://localhost:3000');
  const signUrl = `${baseUrl}/sign/${doc.id}${signer.id ? `?signer=${signer.id}` : ''}`;

  const passcodeNote = doc.accessCode
    ? `<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px; margin-top:16px;">
        <strong style="color:#b45309;">🔒 Access Code Required:</strong>
        <p style="margin:4px 0 0 0; color:#78350f; font-size:13px;">The sender has protected this envelope. You will need your access passcode to unlock and sign.</p>
       </div>`
    : '';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px;">
      <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background: #0f172a; padding: 24px 32px; text-align: left;">
          <h1 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 700; letter-spacing: -0.5px;">OpenSign</h1>
          <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">Zero-Cloud Cryptographic e-Signatures</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px;">
          <h2 style="font-size: 18px; color: #0f172a; margin: 0 0 12px 0;">Please Review & Sign</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            Hello <strong>${signer.name}</strong>,<br>
            You have received an electronic agreement to review and execute:
          </p>

          <div style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">${doc.title}</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; font-family: monospace; color: #64748b;">Envelope ID: ${doc.id}</p>
          </div>

          <!-- DocuSign-Style Action Button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${signUrl}" target="_blank" style="display: inline-block; background-color: #f59e0b; color: #0f172a; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              REVIEW & SIGN
            </a>
          </div>

          ${passcodeNote}

          <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            If the button doesn't work, copy and paste this secure link into your browser:<br>
            <a href="${signUrl}" style="color: #4f46e5; word-break: break-all;">${signUrl}</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #94a3b8;">
            Secured by OpenSign • ESIGN & eIDAS Compliant Cryptographic Seal
          </p>
        </div>

      </div>
    </div>
  `;

  return mailer.sendMail({
    from: getSenderAddress(),
    to: signer.email,
    subject: `Please Review & Sign: ${doc.title}`,
    text: `Hello ${signer.name},\n\nPlease review and sign "${doc.title}":\n${signUrl}\n\nEnvelope ID: ${doc.id}`,
    html
  });
}

/**
 * Send Counter-Sign Request to Sender/Initiator (Turn 2)
 */
async function sendCounterSignInvitation(doc, signer, reqHost) {
  const mailer = getTransporter();
  const baseUrl = process.env.BASE_URL || (reqHost ? `http://${reqHost}` : 'http://localhost:3000');
  const signUrl = `${baseUrl}/sign/${doc.id}?signer=${signer.id}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px;">
      <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background: #4f46e5; padding: 24px 32px; text-align: left;">
          <h1 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 700;">Action Required: Your Counter-Signature Turn</h1>
          <p style="color: #c7d2fe; font-size: 12px; margin: 4px 0 0 0;">Primary party has executed agreement</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px;">
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            Hello <strong>${signer.name}</strong>,<br>
            The primary signer has completed their signature on <strong>${doc.title}</strong>. It is now your turn to review and apply your counter-signature to finalize and seal the agreement.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${signUrl}" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              SIGN YOUR TURN &rarr;
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            Direct Turn URL: <a href="${signUrl}" style="color: #4f46e5; word-break: break-all;">${signUrl}</a>
          </p>
        </div>

      </div>
    </div>
  `;

  return mailer.sendMail({
    from: getSenderAddress(),
    to: signer.email,
    subject: `Action Required: Counter-sign ${doc.title}`,
    text: `The primary signer has signed. Please execute your counter-signature here:\n${signUrl}`,
    html
  });
}

/**
 * Send Completed Agreement & Certificate to All Signers with PDF Attachment
 */
async function sendCompletionEmail(doc, pdfBuffer, reqHost) {
  const mailer = getTransporter();
  const baseUrl = process.env.BASE_URL || (reqHost ? `http://${reqHost}` : 'http://localhost:3000');
  const safeFilename = `${(doc.title || 'Agreement').replace(/[^a-zA-Z0-9_-]/g, '_')}_Executed.pdf`;

  const recipients = doc.signers
    ? doc.signers.map(s => s.email).filter(Boolean)
    : [doc.recipientEmail];

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px;">
      <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background: #065f46; padding: 24px 32px; text-align: left;">
          <h1 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 700;">Completed: All Parties Have Signed</h1>
          <p style="color: #a7f3d0; font-size: 12px; margin: 4px 0 0 0;">Official Certificate of Completion Issued</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px;">
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            All parties have electronically executed <strong>${doc.title}</strong>. A copy of the legally sealed document and the official Certificate of Completion is attached to this email for your records.
          </p>

          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 13px; font-weight: 700; color: #166534;">Certificate ID: ${doc.certificateId || 'CERT-COMPLETED'}</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; font-family: monospace; color: #15803d; word-break: break-all;">
              SHA-256 Digest: ${doc.postSignHash || '--'}
            </p>
          </div>

          <p style="color: #64748b; font-size: 13px; margin: 0 0 16px 0;">
            You can verify the cryptographic seal at any time on the public verifier:<br>
            <a href="${baseUrl}/verify" style="color: #4f46e5;">${baseUrl}/verify</a>
          </p>
        </div>

      </div>
    </div>
  `;

  for (const email of recipients) {
    try {
      await mailer.sendMail({
        from: getSenderAddress(),
        to: email,
        subject: `Completed: ${doc.title} is fully executed`,
        text: `All parties have signed "${doc.title}". Certificate ID: ${doc.certificateId}. The official signed PDF is attached.`,
        html,
        attachments: pdfBuffer ? [
          {
            filename: safeFilename,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ] : []
      });
    } catch (err) {
      console.error(`Failed to send completion email to ${email}:`, err.message);
    }
  }
}

module.exports = {
  sendSignatureInvitation,
  sendCounterSignInvitation,
  sendCompletionEmail
};
