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
  setPreview(file);
});

retryBtn.addEventListener('click', () => {
  form.reset();
  clearResults();
  clearError();
  setStatus('');
  retryBtn.disabled = true;
  clearPreview();
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

  setPreview(file);

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
  const labels = ['OVERVIEW', 'SKILL LEVEL REQUIRED', 'HOW TO', 'TIPS', 'RELATED PRODUCTS'];
  labels.forEach((title) => {
    let contentRaw = sections[title] || '';
    if ((title === 'TIPS' || title === 'RELATED PRODUCTS') && !contentRaw.trim()) {
      // force fallback rendering when blank
      contentRaw = title;
    }
    const card = document.createElement('article');
    card.className = 'result-card';
    const content = contentRaw?.trim();
    let body = content ? escapeHtml(content).replace(/\n/g, '<br>') : '<span class="muted">Not provided.</span>';

    if (title === 'HOW TO' && content) {
      body = renderHowTo(content);
    } else if (title === 'TIPS' && content) {
      body = renderTips(content);
    } else if (title === 'RELATED PRODUCTS' && content) {
      body = renderRelated(content);
    }

    if (title === 'COMPATIBILITY') {
      const status = parseCompatStatus(content || '');
      const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
      card.innerHTML = `
        <h3>${title}</h3>
        <div class="compat-inline">
          <span class="compat-icon">${icon}</span>
          <div class="result-body">${body}</div>
        </div>
      `;
      resultsEl.appendChild(card);
      return;
    }

    card.innerHTML = `
      <h3>${title}</h3>
      <div class="result-body">${body}</div>
    `;

    if (title === 'OVERVIEW' && previewUrl) {
      const img = document.createElement('img');
      img.src = previewUrl;
      img.alt = 'Uploaded part preview';
      img.className = 'preview-image';
      card.appendChild(img);
    }

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
  const parts = cleanList(content, ['tips']);
  const fallback = [
    'Double-check fitment against VIN or OEM part number.',
    'Inspect seals/gaskets and replace if worn.',
    'Verify orientation and seating before closing housings.',
  ];
  const useItems = parts.length >= 2 ? parts : fallback;
  const items = useItems.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('');
  return `<ul class="tips-list">${items}</ul>`;
}

function renderTools(content) {
  const parts = content
    .split(/\n+|,/) // split by newlines or commas
    .map((l) => l.trim())
    .filter(Boolean);
  const fallback = ['Gloves for protection', 'Clean rag', 'Light source'];
  const items = (parts.length ? parts : fallback).map((tool) => `<li>${escapeHtml(tool)}</li>`).join('');
  return `<ul class="tips-list">${items}</ul>`;
}

function renderRelated(content) {
  const parts = cleanList(content, ['related products', 'related']);
  const fallback = [
    'Companion filters (e.g., cabin filter) for the same service interval.',
    'Compatible fluids or seals that pair with this part.',
  ];
  const items = (parts.length ? parts : fallback).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `<ul class="tips-list">${items}</ul>`;
}

function renderHowTo(content) {
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const tools = [];
  const steps = [];
  let current = '';

  lines.forEach((line) => {
    const normalized = line.replace(/^[-•]\s*/, '');
    const lower = normalized.toLowerCase();
    if (lower.startsWith('tools')) {
      current = 'tools';
      return;
    }
    if (lower.startsWith('steps')) {
      current = 'steps';
      return;
    }
    if (current === 'tools') {
      tools.push(normalized);
    } else {
      steps.push(normalized);
    }
  });

  const toolsList = tools.length ? tools : ['Gloves for protection', 'Clean rag', 'Light source'];
  const stepsContent = steps.length ? steps.join('\n') : '';

  const toolsBlock = `<div class="howto-block"><strong>Tools</strong><ul class="tips-list">${toolsList
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join('')}</ul></div>`;

  const stepsBlock = stepsContent
    ? `<div class="howto-block"><strong>Steps</strong>${renderSteps(stepsContent)}</div>`
    : '';

  const blocks = [toolsBlock, stepsBlock].filter(Boolean).join('');
  return blocks || '<span class="muted">Not provided.</span>';
}

function cleanList(content, bannedHeadings = []) {
  return content
    .split(/\n+/)
    .flatMap((line) => line.split(/^- /).map((l) => l.trim()))
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((line) => {
      const lower = line.toLowerCase();
      return !bannedHeadings.some((h) => lower === h || lower === `${h}:`);
    });
}

function renderCompatBanner(sections = {}) {
  const resultRaw = sections.RESULT || '';
  const result = resultRaw.trim();
  if (!result) {
    compatBanner.style.display = 'none';
    compatBanner.innerHTML = '';
    return;
  }
  const status = parseCompatStatus(result);
  const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  compatBanner.innerHTML = `
    <div class="compat-title">
      <span class="compat-label">Result</span>
      <span class="compat-status">${icon} ${escapeHtml(result)}</span>
    </div>
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

function setPreview(file) {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
  previewUrl = URL.createObjectURL(file);
}

function clearPreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }
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
