// Signer Portal Script (DocuSign Recipient Flow)
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let documentId = null;
let docData = null;
let activeSigner = null;
let activeTab = 'draw';
let selectedStyle = 'font-signature-1';
let selectedInitialsStyle = 'font-signature-1';
let adoptedSignatureBase64 = null;
let adoptedInitialsBase64 = null;
let fieldValues = {};
let verifiedPasscode = null;

// Canvas setup
const canvas = document.getElementById('signer-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let isDrawing = false;
let lastPoint = null;
let hasDrawn = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();
  initCanvas();
  resolveDocumentId();
  await loadDocument();
});

function resolveDocumentId() {
  const cleanPath = window.location.pathname.replace(/\/+$/, '');
  const pathParts = cleanPath.split('/');
  const match = pathParts.find(p => p.startsWith('doc_'));

  if (match) {
    documentId = match;
  } else {
    const params = new URLSearchParams(window.location.search);
    documentId = params.get('id');
  }

  if (!documentId) {
    alert('No document specified. Redirecting to dashboard.');
    window.location.href = '/';
  }
}

async function loadDocument() {
  try {
    const res = await fetch(`/api/documents/${documentId}`);
    if (!res.ok) throw new Error('Envelope not found or link expired.');
    docData = await res.json();

    if (docData.isPasswordProtected && !verifiedPasscode) {
      document.getElementById('top-doc-title').textContent = '🔒 Protected Agreement';
      document.getElementById('top-signer-info').textContent = 'Access Passcode Required';
      document.getElementById('paper-content').textContent = '🔒 This document is password protected by the sender. Enter the required access passcode to unlock, review, and execute.';
      document.getElementById('guided-nav-btn')?.classList.add('hidden');
      document.getElementById('finish-btn')?.classList.add('hidden');
      const signTrigger = document.getElementById('docusign-sign-trigger');
      if (signTrigger) signTrigger.classList.add('hidden');
      showPasscodeGate(true);
      return;
    }

    await continueDocumentRender();
  } catch (err) {
    alert(err.message);
  }
}

async function continueDocumentRender() {
  try {
    // Multi-signer resolution
    const urlParams = new URLSearchParams(window.location.search);
    const targetSignerId = urlParams.get('signer');

    if (docData.signers && Array.isArray(docData.signers)) {
      activeSigner = docData.signers.find(s => s.id === targetSignerId) || 
                     docData.signers.find(s => s.status === 'pending') || 
                     docData.signers[0];
    } else {
      activeSigner = {
        name: docData.recipientName,
        email: docData.recipientEmail,
        status: docData.status
      };
    }

    document.getElementById('top-doc-title').textContent = docData.title;
    document.getElementById('top-signer-info').textContent = `Signer: ${activeSigner.name} (${activeSigner.email})`;
    
    document.getElementById('paper-doc-title').textContent = docData.title;
    document.getElementById('paper-doc-id').textContent = `Envelope ID: ${docData.id}`;
    
    document.getElementById('signer-box-name').textContent = activeSigner.name;
    document.getElementById('signer-box-email').textContent = activeSigner.email;
    document.getElementById('signer-input-name').value = activeSigner.name;

    document.getElementById('docusign-sign-trigger')?.classList.remove('hidden');

    // Render Initiator / Counter-Party Box
    renderInitiatorBox();

    // Check if Custom PDF or Standard Template
    if (docData.isCustomPdf) {
      document.getElementById('paper-content').classList.add('hidden');
      const pdfContainer = document.getElementById('pdf-custom-render-container');
      pdfContainer.classList.remove('hidden');
      await renderCustomPdfViewer(pdfContainer);
    } else {
      document.getElementById('paper-content').classList.remove('hidden');
      document.getElementById('paper-content').textContent = docData.content;
    }

    if (docData.status === 'completed' || activeSigner.status === 'completed') {
      showCompletedState();
    } else if (activeSigner.status === 'waiting') {
      showWaitingState();
    } else {
      updateGuidedNavigation();
    }

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    alert(err.message);
  }
}

function renderInitiatorBox() {
  const box = document.getElementById('initiator-box');
  if (!box) return;

  if (docData.signers && docData.signers.length > 1) {
    const otherSigner = docData.signers.find(s => s.id !== activeSigner.id) || docData.signers[0];
    if (otherSigner && otherSigner.status === 'completed') {
      box.className = 'p-5 rounded-xl border border-emerald-200 bg-emerald-50/50 flex flex-col justify-between';
      box.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold text-emerald-800 uppercase tracking-wider">${escapeHtml(otherSigner.role || 'Primary Signer')}</span>
            <span class="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded">EXECUTED</span>
          </div>
          <p class="text-sm font-bold text-slate-800">${escapeHtml(otherSigner.name)}</p>
          <p class="text-xs text-slate-500">${escapeHtml(otherSigner.email)}</p>
        </div>
        <div class="my-3 py-1 flex items-center justify-center">
          ${otherSigner.signatureImage ? `<img src="${otherSigner.signatureImage}" alt="Executed Signature" class="max-h-12 object-contain" />` : '<span class="text-emerald-700 font-bold text-xs">✓ Electronically Signed</span>'}
        </div>
        <div class="pt-2 border-t border-emerald-200 text-[10px] text-slate-500 font-mono">
          Executed: ${otherSigner.signedAt ? new Date(otherSigner.signedAt).toUTCString() : 'Recorded'}
        </div>
      `;
      return;
    } else if (otherSigner && otherSigner.status === 'waiting') {
      box.className = 'p-5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between';
      box.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">${escapeHtml(otherSigner.role || 'Second Signer')}</span>
            <span class="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">WAITING</span>
          </div>
          <p class="text-sm font-bold text-slate-800">${escapeHtml(otherSigner.name)}</p>
          <p class="text-xs text-slate-500">${escapeHtml(otherSigner.email)}</p>
        </div>
        <div class="my-3 text-xs text-slate-400 italic">Awaiting your execution before routing</div>
        <div class="pt-2 border-t border-slate-200 text-[10px] text-slate-400">Sequential Workflow Order #${otherSigner.order}</div>
      `;
      return;
    }
  }

  box.className = 'p-5 rounded-xl border border-slate-200 bg-slate-50/60';
  box.innerHTML = `
    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Company / Initiator</p>
    <p class="text-sm font-bold text-slate-800">OpenSign Core System</p>
    <div class="mt-4 pt-3 border-t border-slate-200 flex items-center text-xs text-slate-500">
      <i data-lucide="shield-check" class="w-4 h-4 mr-1.5 text-indigo-500"></i>
      Pre-authorized and sealed
    </div>
  `;
}

function showWaitingState() {
  const guidedBtn = document.getElementById('guided-nav-btn');
  if (guidedBtn) guidedBtn.classList.add('hidden');
  const finishBtn = document.getElementById('finish-btn');
  if (finishBtn) finishBtn.classList.add('hidden');

  const statusTag = document.getElementById('paper-status-tag');
  if (statusTag) {
    statusTag.className = 'text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300';
    statusTag.textContent = 'Awaiting Previous Signer';
  }

  const signerBox = document.getElementById('signer-action-box');
  if (signerBox) {
    signerBox.className = 'p-6 rounded-xl border-2 border-amber-300 bg-amber-50/60 relative flex flex-col justify-between';
    signerBox.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-amber-800 uppercase tracking-wider">Signing Turn Inactive</span>
          <span class="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded">WAITING FOR TURN</span>
        </div>
        <p class="text-sm font-bold text-slate-900">${escapeHtml(activeSigner.name)}</p>
        <p class="text-xs text-slate-500">${escapeHtml(activeSigner.email)}</p>
      </div>
      <div class="my-4 p-3.5 bg-white rounded-lg border border-amber-200 text-xs text-slate-600 flex items-start space-x-2.5">
        <i data-lucide="clock" class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5"></i>
        <div>
          <p class="font-bold text-amber-900 mb-0.5">It is not your turn to sign yet.</p>
          <span>This agreement is routed sequentially. The preceding party must review and execute before this envelope activates for you.</span>
        </div>
      </div>
      <div class="pt-2 border-t border-amber-200 text-[10px] text-slate-400">
        Order #${activeSigner.order || 2} in signing queue
      </div>
    `;
  }
}

function showPasscodeGate(show) {
  const modal = document.getElementById('passcode-gate-modal');
  if (modal) modal.classList.toggle('hidden', !show);
  if (show) {
    setTimeout(() => {
      document.getElementById('gate-passcode-input')?.focus();
    }, 100);
  }
}

async function submitPasscodeGate() {
  const input = document.getElementById('gate-passcode-input');
  const errorEl = document.getElementById('gate-error-msg');
  const code = (input ? input.value : '').trim();

  if (!code) {
    if (errorEl) {
      errorEl.textContent = 'Please enter the access passcode.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  try {
    const res = await fetch(`/api/documents/${documentId}/verify-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: code })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Incorrect passcode.');
    }

    verifiedPasscode = code;
    showPasscodeGate(false);
    await continueDocumentRender();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
    input.select();
  }
}

// Render custom uploaded PDF with Mozilla PDF.js
async function renderCustomPdfViewer(container) {
  container.innerHTML = '<p class="text-xs text-slate-500 py-6">Loading PDF document pages...</p>';

  try {
    const loadingTask = pdfjsLib.getDocument(`/api/documents/${documentId}/pdf`);
    const pdf = await loadingTask.promise;
    container.innerHTML = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.2 });

      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'page-layer rounded-lg relative overflow-hidden mb-6 shadow-md border border-slate-300 bg-white';
      pageWrapper.id = `signer-page-${pageNum}`;
      pageWrapper.style.width = `${viewport.width}px`;
      pageWrapper.style.height = `${viewport.height}px`;

      const canvasEl = document.createElement('canvas');
      canvasEl.width = viewport.width;
      canvasEl.height = viewport.height;
      const cctx = canvasEl.getContext('2d');

      pageWrapper.appendChild(canvasEl);
      container.appendChild(pageWrapper);

      await page.render({ canvasContext: cctx, viewport }).promise;

      // Overlay fields belonging to this page
      renderFieldsOnSignerPage(pageNum, pageWrapper, viewport.width, viewport.height);
    }
  } catch (err) {
    console.error('Error rendering PDF:', err);
    container.innerHTML = `<p class="text-xs text-red-500 py-6">Failed to load PDF: ${err.message}</p>`;
  }
}

function renderFieldsOnSignerPage(pageNum, pageWrapper, pageWidth, pageHeight) {
  if (!docData.fields) return;

  const pageFields = docData.fields.filter(f => (f.pageIndex + 1) === pageNum);

  pageFields.forEach(field => {
    const isMine = field.signerId === activeSigner.id;
    const isSignerCompleted = activeSigner.status === 'completed';
    const tag = document.createElement('div');
    tag.id = `field-wrapper-${field.id}`;
    tag.className = 'absolute rounded-lg flex items-center justify-center p-1.5 text-xs font-bold transition-all shadow-sm';

    const x = field.xRatio ? field.xRatio * pageWidth : field.x;
    const y = field.yRatio ? field.yRatio * pageHeight : field.y;
    const w = field.widthRatio ? field.widthRatio * pageWidth : (field.width || 140);
    const h = field.heightRatio ? field.heightRatio * pageHeight : (field.height || 40);

    tag.style.left = `${x}px`;
    tag.style.top = `${y}px`;
    tag.style.width = `${w}px`;
    tag.style.height = `${h}px`;

    if (field.type === 'signature') {
      if (isMine && !isSignerCompleted && !adoptedSignatureBase64) {
        tag.className += ' bg-amber-400 hover:bg-amber-300 text-slate-950 border-2 border-amber-500 cursor-pointer docusign-tag';
        tag.innerHTML = `<span class="flex items-center pointer-events-none"><i data-lucide="pen-tool" class="w-3.5 h-3.5 mr-1 text-slate-950"></i> SIGN HERE</span>`;
        tag.onclick = openSignatureModal;
        tag.id = `field-target-${field.id}`;
      } else if (adoptedSignatureBase64 || activeSigner.signatureImage) {
        const sigImg = adoptedSignatureBase64 || activeSigner.signatureImage;
        tag.className += ' bg-emerald-50/90 border border-emerald-400';
        tag.innerHTML = `<img src="${sigImg}" class="max-h-full max-w-full object-contain" />`;
      } else {
        tag.className += ' bg-slate-100/90 text-slate-600 border border-slate-300';
        tag.textContent = `Sign: ${field.signerId}`;
      }
    } else if (field.type === 'initials') {
      if (isMine && !isSignerCompleted && !adoptedInitialsBase64 && !fieldValues[field.id]) {
        tag.className += ' bg-purple-100 hover:bg-purple-200 text-purple-950 border-2 border-purple-500 cursor-pointer docusign-tag';
        tag.innerHTML = `<span class="flex items-center pointer-events-none"><i data-lucide="sparkles" class="w-3.5 h-3.5 mr-1 text-purple-700"></i> INITIAL HERE</span>`;
        tag.onclick = openInitialsModal;
        tag.id = `field-target-${field.id}`;
      } else if (adoptedInitialsBase64 || fieldValues[field.id] || activeSigner.initialsImage) {
        const initImg = adoptedInitialsBase64 || fieldValues[field.id] || activeSigner.initialsImage;
        tag.className += ' bg-purple-50/90 border border-purple-400';
        tag.innerHTML = `<img src="${initImg}" class="max-h-full max-w-full object-contain" />`;
      } else {
        tag.className += ' bg-slate-100/90 text-slate-600 border border-slate-300';
        tag.textContent = 'Initials';
      }
    } else if (field.type === 'text') {
      if (isMine && !isSignerCompleted) {
        tag.className += ' bg-white border-2 border-indigo-400 p-0 overflow-hidden';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `input-${field.id}`;
        input.placeholder = 'Type here...';
        input.value = fieldValues[field.id] || field.value || '';
        input.className = 'w-full h-full text-xs font-semibold px-2 bg-transparent focus:outline-none focus:bg-indigo-50/30 text-slate-800';
        input.oninput = (e) => {
          fieldValues[field.id] = e.target.value;
          updateGuidedNavigation();
        };
        tag.appendChild(input);
      } else {
        tag.className += ' bg-slate-50/90 border border-slate-300 text-slate-800 px-2 justify-start truncate';
        tag.textContent = field.value || fieldValues[field.id] || '';
      }
    } else if (field.type === 'checkbox') {
      if (isMine && !isSignerCompleted) {
        tag.className += ' bg-transparent border-0';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = `input-${field.id}`;
        chk.checked = !!fieldValues[field.id] || !!field.value;
        chk.className = 'w-5 h-5 text-indigo-600 rounded cursor-pointer border-2 border-teal-500 focus:ring-indigo-500';
        chk.onchange = (e) => {
          fieldValues[field.id] = e.target.checked;
          updateGuidedNavigation();
        };
        tag.appendChild(chk);
      } else {
        tag.className += ' bg-transparent border-0 text-slate-800';
        tag.textContent = (field.value || fieldValues[field.id]) ? '☑' : '☐';
      }
    } else if (field.type === 'date') {
      tag.className += ' bg-blue-50/90 text-blue-800 border border-blue-300';
      const curDate = new Date().toLocaleDateString();
      tag.textContent = curDate;
      if (isMine) fieldValues[field.id] = curDate;
    } else if (field.type === 'name') {
      tag.className += ' bg-emerald-50/90 text-emerald-800 border border-emerald-300';
      tag.textContent = activeSigner.name;
      if (isMine) fieldValues[field.id] = activeSigner.name;
    }

    pageWrapper.appendChild(tag);
  });
}

// DocuSign Guided Navigation (START -> NEXT -> FINISH)
function updateGuidedNavigation() {
  if (activeSigner.status === 'completed') {
    document.getElementById('guided-nav-btn')?.classList.add('hidden');
    document.getElementById('finish-btn')?.classList.add('hidden');
    return;
  }

  const requiredRemaining = [];
  
  if (docData.isCustomPdf && docData.fields) {
    const myFields = docData.fields.filter(f => f.signerId === activeSigner.id);
    myFields.forEach(f => {
      if (f.type === 'signature' && !adoptedSignatureBase64) {
        requiredRemaining.push(`field-target-${f.id}`);
      } else if (f.type === 'initials' && !adoptedInitialsBase64 && !fieldValues[f.id]) {
        requiredRemaining.push(`field-target-${f.id}`);
      } else if (f.type === 'text') {
        const val = fieldValues[f.id];
        if (!val || !val.trim()) requiredRemaining.push(`input-${f.id}`);
      }
    });
  } else {
    if (!adoptedSignatureBase64) {
      requiredRemaining.push('signer-action-box');
    }
  }

  const guidedBtn = document.getElementById('guided-nav-btn');
  const guidedText = document.getElementById('guided-nav-text');
  const finishBtn = document.getElementById('finish-btn');

  if (requiredRemaining.length === 0) {
    if (guidedBtn) guidedBtn.classList.add('hidden');
    if (finishBtn) finishBtn.classList.remove('hidden');
  } else {
    if (finishBtn) finishBtn.classList.add('hidden');
    if (guidedBtn) {
      guidedBtn.classList.remove('hidden');
      if (requiredRemaining.length === 1) {
        guidedText.textContent = 'NEXT (1 remaining)';
      } else if (requiredRemaining.length > 1) {
        guidedText.textContent = `NEXT (${requiredRemaining.length} remaining)`;
      } else {
        guidedText.textContent = 'START';
      }
    }
  }
}

function handleGuidedNavClick() {
  let targetEl = null;

  if (docData.isCustomPdf && docData.fields) {
    const myFields = docData.fields.filter(f => f.signerId === activeSigner.id);
    for (const f of myFields) {
      if (f.type === 'signature' && !adoptedSignatureBase64) {
        targetEl = document.getElementById(`field-target-${f.id}`);
        if (targetEl) break;
      }
      if (f.type === 'initials' && !adoptedInitialsBase64 && !fieldValues[f.id]) {
        targetEl = document.getElementById(`field-target-${f.id}`);
        if (targetEl) break;
      }
      if (f.type === 'text' && (!fieldValues[f.id] || !fieldValues[f.id].trim())) {
        targetEl = document.getElementById(`input-${f.id}`);
        if (targetEl) break;
      }
    }
  } else {
    if (!adoptedSignatureBase64) {
      targetEl = document.getElementById('docusign-sign-trigger') || document.getElementById('signer-action-box');
    }
  }

  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.classList.add('ring-4', 'ring-amber-400', 'ring-offset-2');
    setTimeout(() => targetEl.classList.remove('ring-4', 'ring-amber-400', 'ring-offset-2'), 2500);
    if (targetEl.tagName === 'INPUT') targetEl.focus();
  }
}

function showCompletedState() {
  const guidedBtn = document.getElementById('guided-nav-btn');
  if (guidedBtn) guidedBtn.classList.add('hidden');
  const finishBtn = document.getElementById('finish-btn');
  if (finishBtn) finishBtn.classList.add('hidden');
  
  const statusTag = document.getElementById('paper-status-tag');
  if (statusTag) {
    statusTag.className = 'text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200';
    statusTag.textContent = 'Legally Executed';
  }

  const signerBox = document.getElementById('signer-action-box');
  if (signerBox) {
    signerBox.className = 'p-6 rounded-xl border border-emerald-300 bg-emerald-50/50 relative flex flex-col justify-between';
    signerBox.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-emerald-800 uppercase tracking-wider">Digitally Executed</span>
          <span class="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded">COMPLETED</span>
        </div>
        <p class="text-sm font-bold text-slate-900">${escapeHtml(activeSigner.name)}</p>
        <p class="text-xs text-slate-500">${escapeHtml(activeSigner.email)}</p>
      </div>
      <div class="my-4 py-2 flex items-center justify-center">
        ${activeSigner.signatureImage ? `<img src="${activeSigner.signatureImage}" alt="Signature" class="max-h-16 object-contain" />` : '<span class="text-emerald-700 font-bold">✓ Executed</span>'}
      </div>
      <div class="pt-2 border-t border-emerald-200 text-[11px] text-slate-500 font-mono">
        Signed: ${activeSigner.signedAt ? new Date(activeSigner.signedAt).toUTCString() : new Date().toUTCString()}
      </div>
    `;
  }

  // Display certificate
  const certContainer = document.getElementById('completed-certificate-paper');
  if (certContainer) {
    certContainer.classList.remove('hidden');
    document.getElementById('completed-cert-id').textContent = docData.certificateId || 'CERT-COMPLETED';
    document.getElementById('completed-pre-hash').textContent = docData.preSignHash;
    document.getElementById('completed-post-hash').textContent = docData.postSignHash || 'Sealed';
    document.getElementById('completed-signer-details').textContent = `${activeSigner.name} (${activeSigner.email})`;
    document.getElementById('completed-time').textContent = activeSigner.signedAt ? new Date(activeSigner.signedAt).toUTCString() : new Date().toUTCString();
  }
}

// Modal open/close
function openSignatureModal() {
  if (docData && docData.isPasswordProtected && !verifiedPasscode) {
    showPasscodeGate(true);
    return;
  }
  document.getElementById('sig-modal').classList.remove('hidden');
  renderCursivePreviews();
  clearSignerCanvas();
}

function closeSignatureModal() {
  document.getElementById('sig-modal').classList.add('hidden');
}

function switchTab(tab) {
  activeTab = tab;
  const drawBtn = document.getElementById('modal-tab-draw');
  const typeBtn = document.getElementById('modal-tab-type');
  const drawPane = document.getElementById('pane-draw');
  const typePane = document.getElementById('pane-type');

  if (tab === 'draw') {
    drawBtn.className = 'pb-2.5 px-4 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600';
    typeBtn.className = 'pb-2.5 px-4 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-700';
    drawPane.classList.remove('hidden');
    typePane.classList.add('hidden');
  } else {
    typeBtn.className = 'pb-2.5 px-4 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600';
    drawBtn.className = 'pb-2.5 px-4 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-700';
    typePane.classList.remove('hidden');
    drawPane.classList.add('hidden');
    renderCursivePreviews();
  }
}

// Canvas Drawing
function initCanvas() {
  if (!canvas || !ctx) return;
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = (rect.width || 500) * ratio;
  canvas.height = (rect.height || 180) * ratio;
  ctx.scale(ratio, ratio);

  ctx.strokeStyle = '#1e3a8a'; // Navy Blue Ink
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - r.left, y: cy - r.top };
  }

  function start(e) {
    e.preventDefault();
    isDrawing = true;
    hasDrawn = true;
    lastPoint = getPos(e);
  }

  function move(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const curr = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    const midX = (lastPoint.x + curr.x) / 2;
    const midY = (lastPoint.y + curr.y) / 2;
    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midX, midY);
    ctx.stroke();
    lastPoint = curr;
  }

  function stop() { isDrawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', stop);

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', stop);
}

function clearSignerCanvas() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasDrawn = false;
}

function renderCursivePreviews() {
  const name = document.getElementById('signer-input-name').value.trim() || activeSigner.name;
  const container = document.getElementById('cursive-options-container');
  container.innerHTML = '';

  const styles = [
    { id: 'font-signature-1', label: 'Dancing Script' },
    { id: 'font-signature-2', label: 'Caveat' },
    { id: 'font-signature-3', label: 'Great Vibes' },
    { id: 'font-signature-4', label: 'Pacifico' }
  ];

  styles.forEach(s => {
    const isSel = selectedStyle === s.id;
    const div = document.createElement('div');
    div.className = `p-3 rounded-lg border-2 cursor-pointer transition-all ${
      isSel ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'
    }`;
    div.onclick = () => { selectedStyle = s.id; renderCursivePreviews(); };
    div.innerHTML = `
      <div class="${s.id} text-2xl text-blue-900 truncate py-1">${escapeHtml(name)}</div>
      <div class="text-[10px] text-slate-400 mt-1 flex justify-between">
        <span>${s.label}</span>
        ${isSel ? '<span class="text-indigo-600 font-bold">Selected</span>' : ''}
      </div>
    `;
    container.appendChild(div);
  });
}

function generateTypedSigImage(name, fontClass) {
  const off = document.createElement('canvas');
  off.width = 600;
  off.height = 200;
  const octx = off.getContext('2d');

  let f = 'Dancing Script';
  if (fontClass === 'font-signature-2') f = 'Caveat';
  if (fontClass === 'font-signature-3') f = 'Great Vibes';
  if (fontClass === 'font-signature-4') f = 'Pacifico';

  octx.font = `64px "${f}", cursive`;
  octx.fillStyle = '#1e3a8a';
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';
  octx.fillText(name, 300, 100);
  return off.toDataURL('image/png');
}

// Initials Modal Handlers
function openInitialsModal() {
  document.getElementById('initials-modal').classList.remove('hidden');
  const initsInput = document.getElementById('initials-input-chars');
  if (!initsInput.value) {
    const parts = (activeSigner.name || 'Signer').trim().split(/\s+/);
    const inits = parts.length === 1 ? parts[0].substring(0, 2) : (parts[0][0] + parts[parts.length - 1][0]);
    initsInput.value = inits.toUpperCase();
  }
  renderInitialsPreviews();
}

function closeInitialsModal() {
  document.getElementById('initials-modal').classList.add('hidden');
}

function renderInitialsPreviews() {
  const chars = document.getElementById('initials-input-chars').value.trim() || 'DS';
  const container = document.getElementById('initials-options-container');
  container.innerHTML = '';

  const styles = [
    { id: 'font-signature-1', label: 'Dancing Script' },
    { id: 'font-signature-2', label: 'Caveat' },
    { id: 'font-signature-3', label: 'Great Vibes' },
    { id: 'font-signature-4', label: 'Pacifico' }
  ];

  styles.forEach(s => {
    const isSel = selectedInitialsStyle === s.id;
    const div = document.createElement('div');
    div.className = `p-3 rounded-lg border-2 cursor-pointer transition-all ${
      isSel ? 'border-purple-600 bg-purple-50/50' : 'border-slate-200 hover:border-slate-300'
    }`;
    div.onclick = () => { selectedInitialsStyle = s.id; renderInitialsPreviews(); };
    div.innerHTML = `
      <div class="${s.id} text-2xl text-purple-900 truncate py-1">${escapeHtml(chars)}</div>
      <div class="text-[10px] text-slate-400 mt-1 flex justify-between">
        <span>${s.label}</span>
        ${isSel ? '<span class="text-purple-600 font-bold">Selected</span>' : ''}
      </div>
    `;
    container.appendChild(div);
  });
}

function adoptInitials() {
  const chars = document.getElementById('initials-input-chars').value.trim() || 'DS';
  adoptedInitialsBase64 = generateTypedSigImage(chars, selectedInitialsStyle);

  if (docData.fields) {
    docData.fields.filter(f => f.signerId === activeSigner.id && f.type === 'initials').forEach(f => {
      fieldValues[f.id] = adoptedInitialsBase64;
      const spot = document.getElementById(`field-target-${f.id}`);
      if (spot) {
        spot.innerHTML = `<img src="${adoptedInitialsBase64}" class="max-h-full max-w-full object-contain" />`;
        spot.className = 'absolute rounded-lg flex items-center justify-center p-1 bg-purple-50 border-2 border-purple-500 shadow-sm';
      }
    });
  }

  closeInitialsModal();
  updateGuidedNavigation();
}

// Adopt Signature onto Document
function adoptSignature() {
  const agreed = document.getElementById('signer-consent-checkbox').checked;
  if (!agreed) {
    alert('Please check the legal consent checkbox to accept electronic execution.');
    return;
  }

  if (activeTab === 'draw') {
    if (!hasDrawn) {
      alert('Please draw your signature before adopting.');
      return;
    }
    adoptedSignatureBase64 = canvas.toDataURL('image/png');
  } else {
    const name = document.getElementById('signer-input-name').value.trim() || activeSigner.name;
    adoptedSignatureBase64 = generateTypedSigImage(name, selectedStyle);
  }

  // Stamp onto the document visually
  if (docData.fields) {
    docData.fields.filter(f => f.signerId === activeSigner.id && f.type === 'signature').forEach(f => {
      fieldValues[f.id] = adoptedSignatureBase64;
      const customSpot = document.getElementById(`field-target-${f.id}`);
      if (customSpot) {
        customSpot.innerHTML = `<img src="${adoptedSignatureBase64}" class="max-h-full max-w-full object-contain" />`;
        customSpot.classList.remove('docusign-tag', 'bg-amber-400');
        customSpot.classList.add('bg-emerald-50', 'border-emerald-500');
      }
    });
  }

  const triggerContainer = document.getElementById('docusign-sign-trigger')?.parentElement;
  if (triggerContainer) {
    triggerContainer.innerHTML = `
      <div class="w-full flex flex-col items-center">
        <img src="${adoptedSignatureBase64}" class="max-h-16 object-contain" />
        <span class="text-[10px] text-emerald-700 font-bold mt-1">✓ Signature Applied</span>
      </div>
    `;
  }

  closeSignatureModal();
  updateGuidedNavigation();
}

// Final Execution Submission
async function submitFinalSignature() {
  if (!adoptedSignatureBase64) {
    alert('Please complete your signature before submitting.');
    return;
  }

  try {
    const res = await fetch(`/api/documents/${documentId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signatureImage: adoptedSignatureBase64,
        signatureType: activeTab,
        signerName: activeSigner.name,
        signerId: activeSigner.id,
        agreedToLegalNotice: true,
        initialsImage: adoptedInitialsBase64,
        fieldValues: fieldValues,
        passcode: verifiedPasscode
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Signing failed');
    }

    const data = await res.json();
    docData = data.document;

    const pdfBtn = document.getElementById('download-official-pdf-btn');
    if (pdfBtn) {
      pdfBtn.href = `/api/documents/${documentId}/pdf`;
      const safeTitle = (docData.title || 'Agreement').replace(/[^a-zA-Z0-9_-]/g, '_');
      pdfBtn.setAttribute('download', `${safeTitle}_Signed.pdf`);
    }

    // Show celebratory modal
    document.getElementById('finish-modal').classList.remove('hidden');
    showCompletedState();
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    alert(err.message);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
