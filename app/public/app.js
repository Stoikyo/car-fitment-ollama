const form = document.getElementById('analyseForm');
const submitBtn = document.getElementById('submitBtn');
const retryBtn = document.getElementById('retryBtn');
const imageInput = document.getElementById('image');
const yearInput = document.getElementById('year');
const statusEl = document.getElementById('status');
const spinnerEl = document.getElementById('spinner');
const resultsEl = document.getElementById('results');
const compatBanner = document.getElementById('compatBanner');
const errorPanel = document.getElementById('errorPanel');
let previewUrl = '';

yearInput.addEventListener('input', () => {
  yearInput.value = yearInput.value.replace(/\D/g, '');
});

imageInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file || !file.size) {
    return;
  }
  // no inline preview; preview is shown in results card only
});

retryBtn.addEventListener('click', () => {
  form.reset();
  clearResults();
  clearError();
  setStatus('');
  retryBtn.disabled = true;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const file = formData.get('image');

  if (!file || !file.size) {
    setStatus('Please choose an image to upload.', true);
    showError('Please choose an image to upload.');
    return;
  }

  toggleLoading(true);
  setStatus('Uploading image…');
  clearError();
  clearResults();
  showSkeleton();
  retryBtn.disabled = true;

  try {
    const fetchPromise = fetch('/api/analyse', {
      method: 'POST',
      body: formData,
    });

    setStatus('Analysing photo (this can take a minute locally)…');
    const res = await fetchPromise;
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }

    setStatus('Formatting results…');
    renderResults(data.sections || {});
    renderCompatBanner(data.sections || {});
    setStatus('');
    retryBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong', true);
    showError(err.message || 'Something went wrong');
  } finally {
    toggleLoading(false);
    hideSkeleton();
  }
});

function renderResults(sections = {}) {
  resultsEl.innerHTML = '';
  const labels = ['OVERVIEW', 'COMPATIBILITY', 'WHY', 'TOOLS', 'STEPS', 'TIPS'];
  labels.forEach((title) => {
    const contentRaw = sections[title] || '';
    const card = document.createElement('article');
    card.className = 'result-card';
    const content = contentRaw?.trim();
    let body = content ? escapeHtml(content).replace(/\n/g, '<br>') : '<span class="muted">Not provided.</span>';

    if (title === 'STEPS' && content) {
      body = renderSteps(content);
    } else if (title === 'TOOLS' && content) {
      body = renderTools(content);
    } else if (title === 'TIPS' && content) {
      body = renderTips(content);
    }

    card.innerHTML = `
      <h3>${title}</h3>
      <div class="result-body">${body}</div>
    `;

    resultsEl.appendChild(card);
  });
}

function toggleLoading(state) {
  submitBtn.disabled = state;
  submitBtn.textContent = state ? 'Analysing…' : 'Analyse';
  spinnerEl.style.visibility = state ? 'visible' : 'hidden';
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', Boolean(isError));
}

function showError(message) {
  errorPanel.textContent = message;
  errorPanel.style.display = 'block';
}

function clearError() {
  errorPanel.textContent = '';
  errorPanel.style.display = 'none';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderSteps(content) {
  const hasNumbers = /\b1\./.test(content);
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (hasNumbers) {
    const items = lines
      .map((l) => l.replace(/^\d+\.\s*/, ''))
      .map((l) => `<li>${escapeHtml(l)}</li>`)
      .join('');
    return `<ol class="steps-list">${items}</ol>`;
  }
  return lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('');
}

function renderTips(content) {
  const parts = content
    .split(/\n+/)
    .flatMap((line) => line.split(/^- /).map((l) => l.trim()))
    .map((l) => l.trim())
    .filter(Boolean);
  if (!parts.length) {
    return '<span class="muted">Not provided.</span>';
  }
  const items = parts.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('');
  return `<ul class="tips-list">${items}</ul>`;
}

function renderTools(content) {
  const parts = content
    .split(/\n+|,/) // split by newlines or commas
    .map((l) => l.trim())
    .filter(Boolean);
  if (!parts.length) {
    return '<span class="muted">Not provided.</span>';
  }
  const items = parts.map((tool) => `<li>${escapeHtml(tool)}</li>`).join('');
  return `<ul class="tips-list">${items}</ul>`;
}

function renderCompatBanner(sections = {}) {
  const compatRaw = sections.COMPATIBILITY || '';
  const why = sections.WHY || '';
  const compat = compatRaw.trim();
  if (!compat) {
    compatBanner.style.display = 'none';
    compatBanner.innerHTML = '';
    return;
  }
  const status = parseCompatStatus(compat);
  const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  const explanation = why?.trim() || compat;
  compatBanner.innerHTML = `
    <div class="compat-title">
      <span class="compat-label">Result</span>
      <span class="compat-status">${icon} ${escapeHtml(compat)}</span>
    </div>
    <div class="compat-desc">${escapeHtml(explanation)}</div>
  `;
  compatBanner.style.display = 'flex';
}

function parseCompatStatus(text) {
  const lower = text.toLowerCase();
  if (lower.includes('✅') || lower.includes('compatible')) return 'ok';
  if (lower.includes('⚠️') || lower.includes('check')) return 'warn';
  if (lower.includes('❌') || lower.includes('not')) return 'fail';
  return 'warn';
}

function clearResults() {
  resultsEl.innerHTML = '';
  compatBanner.style.display = 'none';
  compatBanner.innerHTML = '';
}

function showSkeleton() {
  compatBanner.style.display = 'none';
  compatBanner.innerHTML = '';
  const skeletonCards = Array.from({ length: 6 })
    .map(
      () => `
      <article class="result-card skeleton-card">
        <div class="skeleton title"></div>
        <div class="skeleton line"></div>
        <div class="skeleton line short"></div>
      </article>`
    )
    .join('');
  resultsEl.innerHTML = skeletonCards;
}

function hideSkeleton() {
  const skeletons = resultsEl.querySelectorAll('.skeleton-card');
  if (skeletons.length) {
    resultsEl.innerHTML = '';
  }
}
