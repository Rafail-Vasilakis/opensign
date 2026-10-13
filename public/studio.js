// OpenSign Visual Field Placement Studio
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;
let envelopeDraft = null;
let placedFields = [];
let currentSignerId = 'signer_1';

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();

  // Load draft from sessionStorage or localStorage
  const draftRaw = sessionStorage.getItem('opensign_draft');
  if (!draftRaw) {
    alert('No document draft found. Please create a new envelope from the dashboard.');
    window.location.href = '/';
    return;
  }

  envelopeDraft = JSON.parse(draftRaw);
  document.getElementById('studio-doc-title').textContent = envelopeDraft.title || 'Custom Agreement';

  setupSignersDropdown();
  await loadAndRenderPdf();
});

function setupSignersDropdown() {
  const select = document.getElementById('selected-signer-select');
  select.innerHTML = '';

  if (!envelopeDraft.signers || envelopeDraft.signers.length === 0) {
    envelopeDraft.signers = [
      { id: 'signer_1', name: 'Signer 1', email: 'signer1@example.com', color: '#f59e0b', order: 1 }
    ];
  }

  envelopeDraft.signers.forEach((s, idx) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `Signer ${idx + 1}: ${s.name} (${s.email})`;
    select.appendChild(opt);
  });

  currentSignerId = envelopeDraft.signers[0].id;
  select.onchange = (e) => {
    currentSignerId = e.target.value;
  };
}

let activePageNum = 1;

async function loadAndRenderPdf() {
  const container = document.getElementById('pdf-pages-container');
  container.innerHTML = '<p class="text-xs text-slate-500 py-10">Rendering PDF pages...</p>';

  try {
    const pdfData = atob(envelopeDraft.pdfBase64);
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    pdfDoc = await loadingTask.promise;

    document.getElementById('page-indicator').textContent = `Total Pages: ${pdfDoc.numPages}`;
    
    // Setup Page Select
    const pageSelect = document.getElementById('active-page-select');
    if (pageSelect) {
      pageSelect.innerHTML = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `Page ${i}`;
        pageSelect.appendChild(opt);
      }
    }

    container.innerHTML = '';

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.25 });

      const pageWrapper = document.createElement('div');
      pageWrapper.className = `page-layer rounded-lg relative overflow-hidden mb-6 shadow-md border ${pageNum === 1 ? 'border-indigo-400 ring-2 ring-indigo-400/30' : 'border-slate-300'} transition-all`;
      pageWrapper.id = `page-wrapper-${pageNum}`;
      pageWrapper.dataset.pageNum = pageNum;
      pageWrapper.style.width = `${viewport.width}px`;
      pageWrapper.style.height = `${viewport.height}px`;

      // Click on page sets it active
      pageWrapper.addEventListener('click', (e) => {
        if (!e.target.closest('.field-badge')) {
          setActivePage(pageNum);
        }
      });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      pageWrapper.appendChild(canvas);
      container.appendChild(pageWrapper);

      await page.render({ canvasContext: ctx, viewport }).promise;
    }

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('PDF Render Error:', err);
    container.innerHTML = `<p class="text-xs text-red-500 py-10">Failed to render PDF: ${err.message}</p>`;
  }
}

function setActivePage(num) {
  activePageNum = num;
  const select = document.getElementById('active-page-select');
  if (select && select.value !== String(num)) {
    select.value = num;
  }

  // Update ring outlines on pages
  for (let i = 1; i <= (pdfDoc ? pdfDoc.numPages : 1); i++) {
    const el = document.getElementById(`page-wrapper-${i}`);
    if (el) {
      if (i === num) {
        el.classList.add('border-indigo-400', 'ring-2', 'ring-indigo-400/30');
        el.classList.remove('border-slate-300');
      } else {
        el.classList.remove('border-indigo-400', 'ring-2', 'ring-indigo-400/30');
        el.classList.add('border-slate-300');
      }
    }
  }
}

// Add Field to the Active Page
function addField(type) {
  const targetPage = document.getElementById(`page-wrapper-${activePageNum}`) || document.getElementById('page-wrapper-1');
  if (!targetPage) return;

  const fieldId = 'field_' + Math.random().toString(36).substr(2, 9);
  const signer = envelopeDraft.signers.find(s => s.id === currentSignerId) || envelopeDraft.signers[0];

  let width = 140;
  let height = 36;
  if (type === 'signature') { width = 160; height = 44; }
  else if (type === 'initials') { width = 90; height = 36; }
  else if (type === 'checkbox') { width = 36; height = 36; }
  else if (type === 'text') { width = 150; height = 34; }
  else if (type === 'date') { width = 120; height = 32; }
  else if (type === 'name') { width = 140; height = 32; }

  const field = {
    id: fieldId,
    type: type, // 'signature' | 'initials' | 'date' | 'name' | 'text' | 'checkbox'
    signerId: signer.id,
    signerName: signer.name,
    pageIndex: activePageNum - 1, // 0-indexed for backend
    pageNum: activePageNum,
    x: 80,
    y: 120 + (placedFields.length * 15) % 200,
    width: width,
    height: height
  };

  placedFields.push(field);
  renderFieldElement(field, targetPage);
  updateFieldsList();
}

function renderFieldElement(field, pageWrapper) {
  const badge = document.createElement('div');
  badge.id = field.id;
  badge.className = 'field-badge absolute border-2 rounded-lg flex items-center justify-between px-2 shadow-sm text-xs font-bold';
  
  if (field.type === 'signature') {
    badge.className += ' bg-amber-50/95 border-amber-400 text-amber-900';
    badge.innerHTML = `
      <div class="flex items-center space-x-1.5 pointer-events-none truncate">
        <i data-lucide="pen-tool" class="w-3.5 h-3.5 text-amber-600"></i>
        <span class="truncate">Sign: ${escapeHtml(field.signerName)}</span>
      </div>
      <button onclick="removeField('${field.id}', event)" class="text-amber-700 hover:text-red-600 p-0.5 ml-1">×</button>
    `;
  } else if (field.type === 'initials') {
    badge.className += ' bg-purple-50/95 border-purple-400 text-purple-900';
    badge.innerHTML = `
      <div class="flex items-center space-x-1.5 pointer-events-none truncate">
        <i data-lucide="sparkles" class="w-3.5 h-3.5 text-purple-600"></i>
        <span class="truncate">Initials</span>
      </div>
      <button onclick="removeField('${field.id}', event)" class="text-purple-700 hover:text-red-600 p-0.5 ml-1">×</button>
    `;
  } else if (field.type === 'date') {
    badge.className += ' bg-blue-50/95 border-blue-400 text-blue-900';
    badge.innerHTML = `
      <div class="flex items-center space-x-1.5 pointer-events-none truncate">
        <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-600"></i>
        <span class="truncate">Date Signed</span>
      </div>
      <button onclick="removeField('${field.id}', event)" class="text-blue-700 hover:text-red-600 p-0.5 ml-1">×</button>
    `;
  } else if (field.type === 'name') {
    badge.className += ' bg-emerald-50/95 border-emerald-400 text-emerald-900';
    badge.innerHTML = `
      <div class="flex items-center space-x-1.5 pointer-events-none truncate">
        <i data-lucide="user" class="w-3.5 h-3.5 text-emerald-600"></i>
        <span class="truncate">Name: ${escapeHtml(field.signerName)}</span>
      </div>
      <button onclick="removeField('${field.id}', event)" class="text-emerald-700 hover:text-red-600 p-0.5 ml-1">×</button>
    `;
  } else if (field.type === 'text') {
    badge.className += ' bg-indigo-50/95 border-indigo-400 text-indigo-900';
    badge.innerHTML = `
      <div class="flex items-center space-x-1.5 pointer-events-none truncate">
        <i data-lucide="type" class="w-3.5 h-3.5 text-indigo-600"></i>
        <span class="truncate">Text Field</span>
      </div>
      <button onclick="removeField('${field.id}', event)" class="text-indigo-700 hover:text-red-600 p-0.5 ml-1">×</button>
    `;
  } else if (field.type === 'checkbox') {
    badge.className += ' bg-teal-50/95 border-teal-400 text-teal-900 justify-center';
    badge.innerHTML = `
      <div class="flex items-center justify-center pointer-events-none">
        <i data-lucide="check-square" class="w-4 h-4 text-teal-700"></i>
      </div>
      <button onclick="removeField('${field.id}', event)" class="text-teal-700 hover:text-red-600 p-0.5 ml-1">×</button>
    `;
  }

  badge.style.left = `${field.x}px`;
  badge.style.top = `${field.y}px`;
  badge.style.width = `${field.width}px`;
  badge.style.height = `${field.height}px`;

  // Dragging mechanics
  makeDraggable(badge, field, pageWrapper);

  pageWrapper.appendChild(badge);
  if (window.lucide) lucide.createIcons();
}

function makeDraggable(badge, field, pageWrapper) {
  let isDragging = false;
  let startX, startY;

  badge.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    startX = e.clientX - badge.offsetLeft;
    startY = e.clientY - badge.offsetTop;
    badge.style.zIndex = '1000';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const wrapperRect = pageWrapper.getBoundingClientRect();
    let newX = e.clientX - startX;
    let newY = e.clientY - startY;

    // Constrain within the page
    newX = Math.max(0, Math.min(newX, pageWrapper.offsetWidth - field.width));
    newY = Math.max(0, Math.min(newY, pageWrapper.offsetHeight - field.height));

    badge.style.left = `${newX}px`;
    badge.style.top = `${newY}px`;

    field.x = newX;
    field.y = newY;
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      badge.style.zIndex = '10';
      updateFieldsList();
    }
  });
}

function removeField(id, e) {
  if (e) e.stopPropagation();
  placedFields = placedFields.filter(f => f.id !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
  updateFieldsList();
}

function updateFieldsList() {
  document.getElementById('fields-count').textContent = placedFields.length;
  const list = document.getElementById('placed-fields-list');
  list.innerHTML = '';

  if (placedFields.length === 0) {
    list.innerHTML = '<p class="text-[11px] text-slate-400 italic">No fields placed yet. Click a field above to drop it on the PDF.</p>';
    return;
  }

  placedFields.forEach(f => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-700';
    item.innerHTML = `
      <div class="truncate">
        <span class="font-bold uppercase text-[10px] text-indigo-600">${f.type}</span>
        <span class="text-[10px] text-slate-500 block truncate">${escapeHtml(f.signerName)} (Page ${f.pageNum})</span>
      </div>
      <button onclick="removeField('${f.id}')" class="text-slate-400 hover:text-red-600 p-1">×</button>
    `;
    list.appendChild(item);
  });
}

// Final Save and Dispatch Envelope
async function saveAndSendEnvelope() {
  if (placedFields.length === 0) {
    alert('Please place at least one signature field onto the document before sending.');
    return;
  }

  // Convert pixel coordinates to ratios relative to each page's width and height for accurate PDF point mapping
  const firstPage = document.getElementById('page-wrapper-1');

  const normalizedFields = placedFields.map(f => {
    const pageEl = document.getElementById(`page-wrapper-${f.pageNum}`) || firstPage;
    const pWidth = pageEl ? pageEl.offsetWidth : 600;
    const pHeight = pageEl ? pageEl.offsetHeight : 800;

    return {
      id: f.id,
      type: f.type,
      signerId: f.signerId,
      pageIndex: f.pageIndex,
      xRatio: f.x / pWidth,
      yRatio: f.y / pHeight,
      widthRatio: f.width / pWidth,
      heightRatio: f.height / pHeight
    };
  });

  try {
    const authToken = localStorage.getItem('opensign_token');
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetch('/api/documents/custom', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        title: envelopeDraft.title,
        pdfBase64: envelopeDraft.pdfBase64,
        signers: envelopeDraft.signers,
        fields: normalizedFields,
        accessCode: envelopeDraft.accessCode || null
      })
    });

    if (res.status === 401) {
      alert('Authentication required. Please sign in to OpenSign.');
      window.location.href = '/';
      return;
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to send custom envelope');
    }

    const created = await res.json();
    sessionStorage.removeItem('opensign_draft');
    alert('🎉 Envelope Created Successfully! Redirecting to Dashboard.');
    window.location.href = '/';
  } catch (err) {
    alert('Error: ' + err.message);
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
