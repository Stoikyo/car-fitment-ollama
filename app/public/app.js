const form = document.getElementById('analyseForm');
const submitBtn = document.getElementById('submitBtn');
const statusEl = document.getElementById('status');
const spinnerEl = document.getElementById('spinner');
const resultsEl = document.getElementById('results');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const file = formData.get('image');

  if (!file || !file.size) {
    setStatus('Please choose an image to upload.');
    return;
  }

  toggleLoading(true);
  setStatus('Analysing with Ollama...');
  resultsEl.innerHTML = '';

  try {
    const res = await fetch('/api/analyse', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }

    renderResults(data.sections);
    setStatus('Done');
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong', true);
    renderError(err.message || 'Something went wrong');
  } finally {
    toggleLoading(false);
  }
});

function renderResults(sections = {}) {
  resultsEl.innerHTML = '';
  Object.entries(sections).forEach(([title, content]) => {
    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <h3>${title}</h3>
      <p>${content ? escapeHtml(content).replace(/\n/g, '<br>') : 'No data returned.'}</p>
    `;
    resultsEl.appendChild(card);
  });
}

function toggleLoading(state) {
  submitBtn.disabled = state;
  submitBtn.textContent = state ? 'Working...' : 'Analyse';
  spinnerEl.style.visibility = state ? 'visible' : 'hidden';
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', Boolean(isError));
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderError(message) {
  resultsEl.innerHTML = '';
  const card = document.createElement('article');
  card.className = 'result-card';
  card.innerHTML = `
    <h3>Error</h3>
    <p>${escapeHtml(message)}</p>
  `;
  resultsEl.appendChild(card);
}
