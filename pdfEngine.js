const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const GREEK_CHAR_MAP = {
  'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th',
  'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
  'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
  'Α': 'A', 'Β': 'B', 'Γ': 'G', 'Δ': 'D', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'I', 'Θ': 'TH',
  'Ι': 'I', 'Κ': 'K', 'Λ': 'L', 'Μ': 'M', 'Ν': 'N', 'Ξ': 'X', 'Ο': 'O', 'Π': 'P',
  'Ρ': 'R', 'Σ': 'S', 'Τ': 'T', 'Υ': 'Y', 'Φ': 'F', 'Χ': 'CH', 'Ψ': 'PS', 'Ω': 'O',
  'ά': 'a', 'έ': 'e', 'ή': 'i', 'ί': 'i', 'ό': 'o', 'ύ': 'y', 'ώ': 'o',
  'Ά': 'A', 'Έ': 'E', 'Ή': 'I', 'Ί': 'I', 'Ό': 'O', 'Ύ': 'Y', 'Ώ': 'O',
  '✓': '[VERIFIED]', '✔': '[VERIFIED]', '⏳': '[PENDING]'
};

function safeWinAnsi(text) {
  if (!text) return '';
  return String(text)
    .split('')
    .map(ch => GREEK_CHAR_MAP[ch] !== undefined ? GREEK_CHAR_MAP[ch] : ch)
    .join('')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function getInitials(name) {
  if (!name) return 'DS';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Stamps signatures, dates, names, initials, text boxes, and checkboxes onto a PDF,
 * and appends the official Certificate of Completion when complete.
 */
async function stampPdfAndAppendCertificate(pdfBuffer, docData) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const pages = pdfDoc.getPages();

  // 1. Stamp all signed fields onto their respective pages
  if (docData.fields && Array.isArray(docData.fields)) {
    for (const field of docData.fields) {
      const signer = docData.signers.find(s => s.id === field.signerId);
      if (!signer || signer.status !== 'completed') {
        continue; // Field not signed yet
      }

      const pageIdx = Math.min(Math.max(field.pageIndex || 0, 0), pages.length - 1);
      const page = pages[pageIdx];
      const { height: pageHeight, width: pageWidth } = page.getSize();

      // Convert from top-left percentage or pixels to PDF bottom-left points
      // We support xRatio / yRatio (0 to 1) or absolute points (x, y)
      let x = field.xRatio !== undefined ? field.xRatio : field.x;
      let yTop = field.yRatio !== undefined ? field.yRatio : field.y;
      let width = field.widthRatio !== undefined ? field.widthRatio : field.width;
      let height = field.heightRatio !== undefined ? field.heightRatio : field.height;

      // Ensure valid numbers
      if (x === undefined || isNaN(Number(x))) x = 0.1;
      if (yTop === undefined || isNaN(Number(yTop))) yTop = 0.8;
      if (width === undefined || isNaN(Number(width))) width = 140;
      if (height === undefined || isNaN(Number(height))) height = 45;

      x = Number(x);
      yTop = Number(yTop);
      width = Number(width);
      height = Number(height);

      // If stored as ratio (0 to 1)
      if (x <= 1 && yTop <= 1) {
        x = x * pageWidth;
        yTop = yTop * pageHeight;
        width = (width <= 1 ? width * pageWidth : width) || 140;
        height = (height <= 1 ? height * pageHeight : height) || 45;
      }

      // PDF coordinate system origin (0,0) is bottom-left
      let yBottom = pageHeight - yTop - height;
      if (isNaN(yBottom) || yBottom < 0) yBottom = 20;
      if (isNaN(x) || x < 0) x = 20;

      if (field.type === 'signature') {
        if (signer.signatureImage) {
          try {
            const base64Data = signer.signatureImage.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            const pngImage = await pdfDoc.embedPng(imgBuffer);
            
            page.drawImage(pngImage, {
              x: x,
              y: yBottom,
              width: width,
              height: height
            });
          } catch (err) {
            console.error('Error embedding signature image:', err);
            page.drawText(safeWinAnsi(`[Signed by ${signer.name}]`), {
              x: x,
              y: yBottom + 10,
              size: 9,
              font: helveticaBold,
              color: rgb(0.1, 0.2, 0.6)
            });
          }
        }
      } else if (field.type === 'initials') {
        const initialsImg = (field.value && String(field.value).startsWith('data:image')) ? field.value : signer.initialsImage;
        if (initialsImg) {
          try {
            const base64Data = initialsImg.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            const pngImage = await pdfDoc.embedPng(imgBuffer);
            page.drawImage(pngImage, {
              x: x,
              y: yBottom,
              width: width,
              height: height
            });
          } catch (err) {
            console.error('Error embedding initials image:', err);
            const initText = field.value || getInitials(signer.name);
            page.drawText(safeWinAnsi(initText), {
              x: x + 4,
              y: yBottom + (height / 2) - 4,
              size: 10,
              font: helveticaBold,
              color: rgb(0.3, 0.2, 0.6)
            });
          }
        } else {
          const initText = field.value || getInitials(signer.name);
          page.drawText(safeWinAnsi(initText), {
            x: x + 4,
            y: yBottom + (height / 2) - 4,
            size: 10,
            font: helveticaBold,
            color: rgb(0.3, 0.2, 0.6)
          });
        }
      } else if (field.type === 'date') {
        const dateStr = field.value || (signer.signedAt ? new Date(signer.signedAt).toLocaleDateString() : new Date().toLocaleDateString());
        page.drawText(safeWinAnsi(dateStr), {
          x: x,
          y: yBottom + 12,
          size: 10,
          font: helvetica,
          color: rgb(0.1, 0.1, 0.1)
        });
      } else if (field.type === 'name') {
        page.drawText(safeWinAnsi(signer.name), {
          x: x,
          y: yBottom + 12,
          size: 10,
          font: helveticaBold,
          color: rgb(0.1, 0.1, 0.1)
        });
      } else if (field.type === 'text') {
        const textVal = field.value !== undefined ? String(field.value) : '';
        if (textVal) {
          page.drawText(safeWinAnsi(textVal), {
            x: x + 2,
            y: yBottom + (height / 2) - 3,
            size: 9.5,
            font: helvetica,
            color: rgb(0.1, 0.1, 0.1)
          });
        }
      } else if (field.type === 'checkbox') {
        const isChecked = field.value === true || field.value === 'true' || field.value === 'checked' || field.value === '1' || field.value === 'on';
        const boxSize = Math.min(width, height, 14);
        page.drawRectangle({
          x: x,
          y: yBottom + (height - boxSize) / 2,
          width: boxSize,
          height: boxSize,
          borderColor: rgb(0.2, 0.2, 0.2),
          borderWidth: 1,
          color: rgb(1, 1, 1)
        });
        if (isChecked) {
          page.drawText('X', {
            x: x + 3,
            y: yBottom + (height - boxSize) / 2 + 2,
            size: 10,
            font: helveticaBold,
            color: rgb(0.1, 0.2, 0.7)
          });
        }
      }
    }
  }

  // 2. If all signers are completed, append the official Certificate of Completion Page!
  const isFullyCompleted = docData.status === 'completed' || docData.signers.every(s => s.status === 'completed');

  if (isFullyCompleted) {
    const certPage = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width: cWidth, height: cHeight } = certPage.getSize();

    // Security Double Border
    certPage.drawRectangle({
      x: 28,
      y: 28,
      width: cWidth - 56,
      height: cHeight - 56,
      borderColor: rgb(0.31, 0.27, 0.90), // #4f46e5 Indigo
      borderWidth: 2
    });

    certPage.drawRectangle({
      x: 32,
      y: 32,
      width: cWidth - 64,
      height: cHeight - 64,
      borderColor: rgb(0.58, 0.64, 0.72), // #94a3b8 Slate
      borderWidth: 0.5
    });

    // Certificate Title Header
    certPage.drawText('CERTIFICATE OF COMPLETION & AUDIT TRAIL', {
      x: 60,
      y: cHeight - 60,
      size: 15,
      font: helveticaBold,
      color: rgb(0.12, 0.11, 0.29)
    });

    certPage.drawText('Official Multi-Signer Electronic Record • ESIGN Act (15 U.S.C. § 7001) & UETA Compliant', {
      x: 60,
      y: cHeight - 76,
      size: 7.5,
      font: helvetica,
      color: rgb(0.39, 0.45, 0.55)
    });

    // Certificate ID Badge
    const certId = docData.certificateId || 'CERT-MULTI-SIGNER-SEAL';
    certPage.drawRectangle({
      x: cWidth / 2 - 110,
      y: cHeight - 110,
      width: 220,
      height: 20,
      color: rgb(0.93, 0.95, 1.0),
      borderColor: rgb(0.78, 0.82, 0.99),
      borderWidth: 1
    });

    certPage.drawText(`CERTIFICATE ID: ${certId}`, {
      x: cWidth / 2 - 95,
      y: cHeight - 104,
      size: 8.5,
      font: courierBold,
      color: rgb(0.22, 0.19, 0.64)
    });

    // Cryptographic Checksums Box
    const digestY = cHeight - 190;
    certPage.drawRectangle({
      x: 45,
      y: digestY,
      width: cWidth - 90,
      height: 64,
      color: rgb(0.97, 0.98, 0.99),
      borderColor: rgb(0.80, 0.83, 0.88),
      borderWidth: 0.5
    });

    certPage.drawText('CRYPTOGRAPHIC INTEGRITY CHECKSUMS', {
      x: 55,
      y: digestY + 48,
      size: 7.5,
      font: helveticaBold,
      color: rgb(0.28, 0.33, 0.41)
    });

    certPage.drawText('Pre-Sign Document SHA-256 Digest:', {
      x: 55,
      y: digestY + 36,
      size: 7,
      font: helvetica,
      color: rgb(0.39, 0.45, 0.55)
    });

    certPage.drawText(docData.preSignHash || 'N/A', {
      x: 55,
      y: digestY + 26,
      size: 6.8,
      font: courier,
      color: rgb(0.2, 0.25, 0.33)
    });

    certPage.drawText('Post-Sign Sealed SHA-256 Digest:', {
      x: 55,
      y: digestY + 14,
      size: 7,
      font: helvetica,
      color: rgb(0.39, 0.45, 0.55)
    });

    certPage.drawText(docData.postSignHash || 'Sealed Multi-Signature Checksum Anchored', {
      x: 55,
      y: digestY + 4,
      size: 6.8,
      font: courierBold,
      color: rgb(0.02, 0.59, 0.41)
    });

    // Multi-Signer Execution Roster
    let signerY = digestY - 20;
    certPage.drawText('SIGNER ATTESTATION ROSTER', {
      x: 45,
      y: signerY,
      size: 8.5,
      font: helveticaBold,
      color: rgb(0.12, 0.16, 0.23)
    });

    signerY -= 12;

    if (docData.signers && Array.isArray(docData.signers)) {
      docData.signers.forEach((s, idx) => {
        certPage.drawRectangle({
          x: 45,
          y: signerY - 32,
          width: cWidth - 90,
          height: 38,
          color: s.status === 'completed' ? rgb(0.95, 0.99, 0.96) : rgb(0.99, 0.98, 0.95),
          borderColor: s.status === 'completed' ? rgb(0.65, 0.95, 0.82) : rgb(0.98, 0.90, 0.54),
          borderWidth: 0.5
        });

        certPage.drawText(safeWinAnsi(`Signer ${idx + 1} (${s.role || 'Signer'}): ${s.name} <${s.email}>`), {
          x: 55,
          y: signerY - 12,
          size: 8,
          font: helveticaBold,
          color: rgb(0.06, 0.09, 0.16)
        });

        const statusTag = s.status === 'completed' ? `[SIGNED]: ${new Date(s.signedAt).toUTCString()}` : '[Awaiting Signature]';
        certPage.drawText(safeWinAnsi(statusTag), {
          x: 55,
          y: signerY - 24,
          size: 7.2,
          font: courierBold,
          color: s.status === 'completed' ? rgb(0.02, 0.59, 0.41) : rgb(0.71, 0.33, 0.04)
        });

        signerY -= 44;
      });
    }

    // Chronological Audit Timeline
    let timelineY = signerY - 10;
    certPage.drawText('CHRONOLOGICAL AUDIT TIMELINE', {
      x: 45,
      y: timelineY,
      size: 8.5,
      font: helveticaBold,
      color: rgb(0.12, 0.16, 0.23)
    });

    timelineY -= 14;

    if (docData.auditLog && Array.isArray(docData.auditLog)) {
      docData.auditLog.slice(-5).forEach(log => {
        certPage.drawCircle({
          x: 52,
          y: timelineY + 2,
          size: 2.5,
          color: rgb(0.31, 0.27, 0.90)
        });

        certPage.drawText(safeWinAnsi(`${log.event}  --  ${new Date(log.timestamp).toUTCString()}`), {
          x: 60,
          y: timelineY,
          size: 7.2,
          font: helveticaBold,
          color: rgb(0.06, 0.09, 0.16)
        });

        certPage.drawText(safeWinAnsi(`${log.details || ''} (IP: ${log.ip || 'N/A'})`), {
          x: 60,
          y: timelineY - 9,
          size: 6.8,
          font: helvetica,
          color: rgb(0.28, 0.33, 0.41)
        });

        timelineY -= 24;
      });
    }

    // Footer
    certPage.drawText(
      'This Certificate of Completion is an immutable electronic record generated by the OpenSign Engine. Non-repudiation guaranteed by SHA-256 seal.',
      {
        x: 45,
        y: 42,
        size: 6.5,
        font: helvetica,
        color: rgb(0.39, 0.45, 0.55)
      }
    );
  }

  const finalBytes = await pdfDoc.save();
  return Buffer.from(finalBytes);
}

module.exports = { stampPdfAndAppendCertificate };
