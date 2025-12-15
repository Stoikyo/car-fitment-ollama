const express = require('express');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const { performance } = require('perf_hooks');

const app = express();
const port = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const rawModel = process.env.OLLAMA_MODEL || 'llava';
const OLLAMA_MODEL = rawModel.includes(':') ? rawModel : `${rawModel}:latest`;
const PROVIDER = (process.env.PROVIDER || 'ollama').toLowerCase();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
    }
  },
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/analyse', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: 'Please upload an image file (max 5MB).' });
    }

    const { year = '', make = '', model = '', productUrl = '', notes = '' } = req.body || {};
    if (!year || !make || !model || !notes) {
      return res.status(400).json({ error: 'Year, make, model, and description/notes are required.' });
    }

    const resizeStart = performance.now();
    let processedBuffer = req.file.buffer;
    let resized = false;

    try {
      const image = sharp(req.file.buffer);
      const metadata = await image.metadata();
      let pipeline = image;

      if (metadata.width && metadata.width > 1024) {
        pipeline = pipeline.resize({ width: 768 });
        resized = true;
      }

      processedBuffer = await pipeline.jpeg({ quality: 70 }).toBuffer();
    } catch (imageErr) {
      console.error('Image processing failed:', imageErr);
      return res.status(400).json({ error: 'Could not process the image. Try another file.' });
    }

    const resizeDuration = performance.now() - resizeStart;
    const base64Image = processedBuffer.toString('base64');

    const systemPrompt = `You are a concise automotive fitment assistant. Output exactly these headings and under each heading include only the content (do NOT repeat any headings inside sections). Keep 1–2 short lines per section except HOW TO which can have up to 10 numbered steps. Be specific and complete each step:
RESULT: Start with one of ✅ Compatible | ⚠️ Check fitment | ❌ Not compatible and a short reason tied to the vehicle.
COMPATIBILITY: Restate the status and why (e.g., part number/size cues, vehicle match or mismatch).
OVERVIEW: Identify the item in the image, key markings, features, or condition.
SKILL LEVEL REQUIRED: How DIY-friendly this is (e.g., Easy / Moderate / Pro) and brief rationale.
HOW TO: Start with "Tools:" as a bulleted list, then "Steps:" as numbered steps (max 10) including safety considerations and pre/post actions (e.g., drain/refill fluids, torque notes). Do not truncate steps; finish each action.
TIPS: 2–3 specific cautions/cross-checks tied to the photo and vehicle (e.g., orientation, sealing surfaces, torque). Always include at least two tips.
RELATED PRODUCTS: 1–2 complementary parts the user might consider for the same vehicle (e.g., companion filters/fluids/hardware). Always include at least one related product suggestion.
Keep it brief and specific using the image and provided vehicle info. Ensure all headings have content, avoid repeating the heading text.`;

    const details = [
      `Year: ${year || 'Unknown'}`,
      `Make: ${make || 'Unknown'}`,
      `Model: ${model || 'Unknown'}`,
      productUrl ? `Product URL: ${productUrl}` : '',
      notes ? `Notes: ${notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    let rawText = '';
    let inferenceDuration = 0;

    if (PROVIDER === 'openai') {
      if (!OPENAI_API_KEY) {
        return res.status(400).json({ error: 'OPENAI_API_KEY is required when PROVIDER=openai.' });
      }
      const { content, durationMs } = await callOpenAI({
        systemPrompt,
        details,
        base64Image,
      });
      rawText = content;
      inferenceDuration = durationMs;
    } else {
      const ollamaPayload = {
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Analyse this car part photo for fitment. Use these vehicle details:\n${details}`,
            images: [base64Image],
          },
        ],
        options: {
          num_predict: 512,
          temperature: 0.2,
        },
      stream: false,
    };

      const { content, durationMs } = await callOllama({ payload: ollamaPayload });
      rawText = content;
      inferenceDuration = durationMs;
    }

    if (!rawText) {
      return res.status(502).json({ error: 'Received an unexpected response from the model.' });
    }

    const sections = parseSections(rawText);
    console.log(
      `Timing(ms): resize=${resizeDuration.toFixed(1)} (resized=${resized}), infer=${inferenceDuration.toFixed(
        1
      )}, provider=${PROVIDER}`
    );
    res.json({ rawText, sections });
  } catch (err) {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image too large. Max size is 5MB.'
          : 'Only image uploads are allowed.';
      return res.status(400).json({ error: message });
    }

    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.error('Ollama unreachable:', err.message);
      return res
        .status(503)
        .json({ error: 'Ollama is not reachable. Is the container running and the model pulled?' });
    }

    console.error('Unexpected error:', err);
    res
      .status(500)
      .json({ error: 'Something went wrong while processing your request.' });
  }
});

async function callOllama({ payload }) {
  const start = performance.now();
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const durationMs = performance.now() - start;

  if (!response.ok) {
    const text = await response.text();
    let ollamaError = '';
    try {
      const parsed = JSON.parse(text);
      ollamaError = parsed?.error ? ` Ollama error: ${parsed.error}` : '';
    } catch (_) {
      // ignore JSON parse issues
    }
    console.error('Ollama error response:', text);
    throw new Error(
      `Ollama responded with an error for model "${OLLAMA_MODEL}". Ensure the model is pulled and running.${ollamaError}`
    );
  }

  const data = await response.json();
  return { content: data?.message?.content?.trim() || '', durationMs };
}

async function callOpenAI({ systemPrompt, details, base64Image }) {
  const start = performance.now();
  const userContent = [
    { type: 'text', text: `Analyse this car part photo for fitment. Use these vehicle details:\n${details}` },
    {
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${base64Image}` },
    },
  ];

  const body = {
    model: OPENAI_MODEL,
    temperature: 0.2,
    max_tokens: 512,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      ...(process.env.OPENAI_ORG ? { 'OpenAI-Organization': process.env.OPENAI_ORG } : {}),
    },
    body: JSON.stringify(body),
  });
  const durationMs = performance.now() - start;

  if (!response.ok) {
    const text = await response.text();
    console.error('OpenAI error response:', text);
    throw new Error(`OpenAI responded with an error for model "${OPENAI_MODEL}".`);
  }

  const data = await response.json();
  const content =
    data?.choices?.[0]?.message?.content?.trim() ||
    data?.choices?.[0]?.message?.content_parts?.[0]?.text?.trim() ||
    '';
  return { content, durationMs };
}

function parseSections(text) {
  const labels = ['RESULT', 'COMPATIBILITY', 'OVERVIEW', 'SKILL LEVEL REQUIRED', 'HOW TO', 'TIPS', 'RELATED PRODUCTS'];
  const sections = {};
  labels.forEach((label) => {
    sections[label] = '';
  });

  // Match labels at line starts with ":" or "-" separators, case-insensitive.
  const pattern = new RegExp(`(?:^|\\n)\\s*(${labels.join('|')})\\s*[:\\-]\\s*`, 'ig');
  const matches = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    matches.push({ label: match[1].toUpperCase(), start: pattern.lastIndex });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const end =
      i + 1 < matches.length
        ? matches[i + 1].start - matchSpacingOffset(text, matches[i + 1].start)
        : text.length;
    const content = cleanSectionBody(text.slice(current.start, end).trim(), labels);
    if (labels.includes(current.label)) {
      sections[current.label] = content;
    }
  }

  const hasContent = labels.some((label) => sections[label]);
  if (!hasContent && text?.trim()) {
    sections.OVERVIEW = text.trim();
  }

  return sections;

  function matchSpacingOffset(fullText, idx) {
    // Skip backwards over any whitespace immediately before the next match to avoid trimming issues.
    let offset = 0;
    while (idx - 1 - offset >= 0 && /\s/.test(fullText[idx - 1 - offset])) {
      offset += 1;
    }
    return offset;
  }

  function cleanSectionBody(body, labelsList) {
    if (!body) return '';
    const headingPattern = new RegExp(`^\\s*(?:${labelsList.join('|')})\\s*[:\\-]\\s*`, 'i');
    return body
      .split('\n')
      .map((line) => (headingPattern.test(line) ? headingPattern[Symbol.replace](line, '').trim() : line.trim()))
      .filter(Boolean)
      .join('\n');
  }
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
