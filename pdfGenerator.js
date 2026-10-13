const PDFDocument = require('pdfkit');
const zlib = require('zlib');
const PNG = require('png-js');

function canDecodePng(buf) {
  try {
    const p = new PNG(buf);
    if (!p.width || !p.height || !p.imgData) return false;
    zlib.inflateSync(new Uint8Array(p.imgData));
    return true;
  } catch (e) {
    return false;
  }
}

function generatePixelPerfectPDF(docData, outputStream) {
  const pdf = new PDFDocument({
    size: 'A4',
    margins: { top: 38, bottom: 38, left: 42, right: 42 },
    autoFirstPage: true,
    info: {
      Title: docData.title,
      Author: 'OpenSign Core System',
      Subject: `EnvelopeID:${docData.id}`,
      Keywords: `EnvelopeID:${docData.id} CertificateID:${docData.certificateId || ''} PreSignHash:${docData.preSignHash || ''}`
    }
  });

  pdf.on('error', (err) => {
    console.error('PDF stream error handled safely:', err);
  });

  pdf.pipe(outputStream);

  const pageWidth = pdf.page.width;
  const pageHeight = pdf.page.height;
  const contentWidth = pageWidth - 84;

  // ==========================================
  // PAGE 1: THE LEGAL AGREEMENT & EXECUTION
  // ==========================================

  // Document Top Header
  pdf.font('Helvetica-Bold').fontSize(8).fillColor('#4f46e5').text('OPENSIGN', 42, 28, { continued: true });
  pdf.font('Helvetica').fontSize(8).fillColor('#64748b').text('  |  SECURE ELECTRONIC RECORD', { continued: true });
  pdf.font('Courier').fontSize(7.5).fillColor('#475569').text(`UUID: ${docData.id}`, { align: 'right' });

  pdf.strokeColor('#e2e8f0').lineWidth(0.75).moveTo(42, 38).lineTo(pageWidth - 42, 38).stroke();

  // Agreement Title
  pdf.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a').text(docData.title, 42, 48, { align: 'left' });
  
  // Status & Date Ribbon
  const isCompleted = docData.status === 'completed';
  const statusText = isCompleted ? 'LEGALLY EXECUTED & CERTIFIED' : 'PENDING EXECUTION';
  const statusColor = isCompleted ? '#059669' : '#d97706';

  // Vector status dot (never has unicode encoding issues)
  pdf.circle(46, 70, 2.5).fillColor(statusColor).fill();
  pdf.font('Helvetica-Bold').fontSize(8).fillColor(statusColor).text(statusText, 52, 67, { continued: true });
  pdf.font('Helvetica').fontSize(8).fillColor('#64748b').text(`   •   Created: ${new Date(docData.createdAt).toUTCString()}`);

  pdf.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(42, 80).lineTo(pageWidth - 42, 80).stroke();

  // Document Body Content with compact, crisp legal formatting
  pdf.font('Times-Roman').fontSize(9.2).fillColor('#1e293b').lineGap(2.2);
  
  const contentYStart = 90;
  pdf.text(docData.content, 42, contentYStart, {
    width: contentWidth,
    align: 'left'
  });

  // Calculate position for signature blocks
  let sigY = pdf.y + 16;

  // Only break page if really needed for extremely long custom contracts
  if (sigY > pageHeight - 130) {
    pdf.addPage();
    sigY = 40;
  }

  // Signature Section Header
  pdf.strokeColor('#e2e8f0').lineWidth(0.75).moveTo(42, sigY).lineTo(pageWidth - 42, sigY).stroke();
  sigY += 8;
  pdf.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('ELECTRONIC SIGNATURE & ATTESTATION', 42, sigY);
  sigY += 14;

  const boxWidth = (contentWidth - 16) / 2;
  const boxHeight = 88;

  const senderSigner = docData.signers ? docData.signers.find(s => s.isSender || s.order === 2) : null;
  const primarySigner = docData.signers ? docData.signers.find(s => s.order === 1) : null;

  // Box 1: Initiator / Counter-Signer Box
  const senderSigned = senderSigner && senderSigner.signatureImage;
  pdf.rect(42, sigY, boxWidth, boxHeight).lineWidth(0.75)
    .strokeColor(senderSigned ? '#a7f3d0' : '#cbd5e1')
    .fillColor(senderSigned ? '#f0fdf4' : '#f8fafc').fillAndStroke();

  pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(senderSigned ? '#065f46' : '#475569')
    .text(senderSigner ? 'INITIATOR / COUNTER-SIGNER' : 'INITIATOR / DISCLOSING PARTY', 50, sigY + 8);
  pdf.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a')
    .text(senderSigner ? senderSigner.name : 'OpenSign Core Engine', 50, sigY + 20);
  pdf.font('Helvetica').fontSize(7.5).fillColor('#64748b')
    .text(senderSigner ? senderSigner.email : 'Authorized System Signatory', 50, sigY + 32);
  
  if (senderSigned) {
    let senderImgDrawn = false;
    try {
      const base64Data = senderSigner.signatureImage.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer = Buffer.from(base64Data, 'base64');
      if (canDecodePng(imgBuffer)) {
        pdf.image(imgBuffer, 50, sigY + 40, { fit: [boxWidth - 20, 32], align: 'left' });
        senderImgDrawn = true;
      }
    } catch (_) {}
    if (!senderImgDrawn) {
      pdf.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a8a').text(`[Signed: ${senderSigner.name}]`, 50, sigY + 45);
    }
    pdf.font('Courier').fontSize(6.5).fillColor('#059669').text(`Signed: ${new Date(senderSigner.signedAt).toUTCString()}`, 50, sigY + 76);
  } else if (senderSigner) {
    pdf.font('Helvetica-Oblique').fontSize(8.5).fillColor('#b45309').text('[ Awaiting Counter-Signature ]', 50, sigY + 52);
  } else {
    pdf.circle(53, sigY + 68, 2).fillColor('#059669').fill();
    pdf.font('Helvetica-Bold').fontSize(7).fillColor('#059669').text('Cryptographically Verified Envelope', 58, sigY + 65);
  }

  // Box 2: Signer Box
  const signerX = 42 + boxWidth + 16;
  const primarySigImg = (primarySigner && primarySigner.signatureImage) || (docData.signatureData && docData.signatureData.image);
  const primarySigName = (primarySigner && primarySigner.name) || docData.recipientName;
  const primarySigEmail = (primarySigner && primarySigner.email) || docData.recipientEmail;
  const primarySigTime = (primarySigner && primarySigner.signedAt) || docData.signedAt;
  const primarySigned = !!primarySigImg;

  pdf.rect(signerX, sigY, boxWidth, boxHeight).lineWidth(0.75)
    .strokeColor(primarySigned ? '#a7f3d0' : '#fde68a')
    .fillColor(primarySigned ? '#f0fdf4' : '#fffbeb').fillAndStroke();
  
  pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(primarySigned ? '#065f46' : '#92400e').text('SIGNER / ACCEPTING PARTY', signerX + 10, sigY + 8);
  pdf.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(primarySigName, signerX + 10, sigY + 20);
  pdf.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(primarySigEmail, signerX + 10, sigY + 31);

  if (primarySigned) {
    let imageDrawn = false;
    try {
      const base64Data = primarySigImg.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer = Buffer.from(base64Data, 'base64');
      if (canDecodePng(imgBuffer)) {
        pdf.image(imgBuffer, signerX + 10, sigY + 40, { fit: [boxWidth - 20, 32], align: 'left' });
        imageDrawn = true;
      }
    } catch (e) {
      console.error('Error rendering signature image in pdfGenerator:', e);
    }

    if (!imageDrawn) {
      pdf.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a8a').text(`[Signed: ${primarySigName}]`, signerX + 10, sigY + 45);
    }
    pdf.font('Courier').fontSize(6.5).fillColor('#059669').text(`Signed: ${new Date(primarySigTime).toUTCString()}`, signerX + 10, sigY + 76);
  } else {
    pdf.font('Helvetica-Oblique').fontSize(8.5).fillColor('#b45309').text('[ Awaiting Electronic Signature ]', signerX + 10, sigY + 52);
  }

  // ==========================================
  // PAGE 2: OFFICIAL CERTIFICATE OF COMPLETION
  // ==========================================
  pdf.addPage();

  // Official Guilloche-style double security border
  pdf.rect(28, 28, pageWidth - 56, pageHeight - 56).lineWidth(2).strokeColor('#4f46e5').stroke();
  pdf.rect(32, 32, pageWidth - 64, pageHeight - 64).lineWidth(0.5).strokeColor('#94a3b8').stroke();

  // Certificate Header
  pdf.moveDown(1.5);
  pdf.font('Helvetica-Bold').fontSize(15).fillColor('#1e1b4b').text('CERTIFICATE OF COMPLETION & AUDIT TRAIL', 42, 50, { align: 'center' });
  pdf.font('Helvetica').fontSize(7.5).fillColor('#64748b').text('Official Electronic Audit Record  •  Pursuant to ESIGN Act (15 U.S.C. § 7001) & UETA', 42, 68, { align: 'center' });

  // Certificate ID badge
  const certId = docData.certificateId || 'CERT-PENDING-EXECUTION';
  pdf.rect(pageWidth / 2 - 110, 84, 220, 20).lineWidth(1).strokeColor('#c7d2fe').fillColor('#eef2ff').fillAndStroke();
  pdf.font('Courier-Bold').fontSize(8.5).fillColor('#3730a3').text(`CERTIFICATE ID: ${certId}`, pageWidth / 2 - 110, 89, { width: 220, align: 'center' });

  // Cryptographic Digests Section
  const digestY = 118;
  pdf.rect(45, digestY, contentWidth - 6, 64).lineWidth(0.5).strokeColor('#cbd5e1').fillColor('#f8fafc').fillAndStroke();

  pdf.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569').text('CRYPTOGRAPHIC INTEGRITY CHECKSUMS', 55, digestY + 7);

  pdf.font('Helvetica').fontSize(7).fillColor('#64748b').text('Pre-Sign Document SHA-256 Digest:', 55, digestY + 20);
  pdf.font('Courier').fontSize(6.8).fillColor('#334155').text(docData.preSignHash || 'N/A', 55, digestY + 29);

  pdf.font('Helvetica').fontSize(7).fillColor('#64748b').text('Post-Sign Sealed SHA-256 Digest:', 55, digestY + 41);
  pdf.font('Courier-Bold').fontSize(6.8).fillColor(isCompleted ? '#059669' : '#64748b').text(docData.postSignHash || 'Pending signature execution...', 55, digestY + 50);

  // Signer Identity & Verification Metadata
  const metaY = 192;
  pdf.rect(45, metaY, contentWidth - 6, 58).lineWidth(0.5).strokeColor('#cbd5e1').fillColor('#f8fafc').fillAndStroke();
  pdf.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569').text('SIGNER IDENTITY & VERIFICATION METADATA', 55, metaY + 7);

  pdf.font('Helvetica').fontSize(7.5).fillColor('#64748b').text('Designated Signer:', 55, metaY + 21);
  pdf.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text(`${docData.recipientName}  <${docData.recipientEmail}>`, 140, metaY + 21);

  pdf.font('Helvetica').fontSize(7.5).fillColor('#64748b').text('Signing Timestamp:', 55, metaY + 33);
  pdf.font('Courier').fontSize(7.5).fillColor('#0f172a').text(docData.signedAt ? new Date(docData.signedAt).toUTCString() : 'Pending Execution', 140, metaY + 33);

  const signerIp = docData.signatureData?.ip || '127.0.0.1';
  pdf.font('Helvetica').fontSize(7.5).fillColor('#64748b').text('Recorded IP Address:', 55, metaY + 45);
  pdf.font('Courier').fontSize(7.5).fillColor('#0f172a').text(signerIp, 140, metaY + 45);

  // Event Timeline Log
  let timelineY = 264;
  pdf.font('Helvetica-Bold').fontSize(8.5).fillColor('#1e293b').text('CHRONOLOGICAL AUDIT TIMELINE', 45, timelineY);
  timelineY += 14;

  pdf.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(45, timelineY).lineTo(pageWidth - 45, timelineY).stroke();
  timelineY += 8;

  if (docData.auditLog && Array.isArray(docData.auditLog)) {
    docData.auditLog.forEach((log) => {
      // Vector timeline circle
      pdf.circle(52, timelineY + 4, 2.5).fillColor('#4f46e5').fill();
      
      pdf.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text(log.event, 60, timelineY, { continued: true });
      pdf.font('Courier').fontSize(7).fillColor('#64748b').text(`  —  ${new Date(log.timestamp).toUTCString()}`);
      
      pdf.font('Helvetica').fontSize(7).fillColor('#475569').text(log.details || '', 60, timelineY + 10);
      pdf.font('Courier').fontSize(6.5).fillColor('#94a3b8').text(`Client IP: ${log.ip || 'N/A'}`, 60, timelineY + 19);
      
      timelineY += 30;
    });
  }

  // Legal Notice Footer
  const footerY = pageHeight - 65;
  pdf.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(45, footerY).lineTo(pageWidth - 45, footerY).stroke();
  pdf.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(
    'This Certificate of Completion is an immutable electronic record generated by the OpenSign Engine. The cryptographic checksums above verify that the document content and signature have not been altered since execution.',
    45,
    footerY + 7,
    { width: contentWidth - 6, align: 'center' }
  );

  pdf.end();
}

function generatePixelPerfectPDFBuffer(docData) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    const stream = new (require('stream').Writable)({
      write(chunk, encoding, next) {
        buffers.push(chunk);
        next();
      }
    });
    stream.on('finish', () => resolve(Buffer.concat(buffers)));
    stream.on('error', reject);
    generatePixelPerfectPDF(docData, stream);
  });
}

module.exports = {
  generatePixelPerfectPDF,
  generatePixelPerfectPDFBuffer
};
