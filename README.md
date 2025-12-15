# Car Part Fit Checker

Small web app that analyzes a part photo and vehicle details using an Ollama vision model, then returns fitment guidance in clear sections. Everything runs locally via Docker Compose.

## Demo
- Loom walkthrough: _add link_
- Screenshot: `.car-part-fit-checker-empty-state.png`

## Prerequisites
- Docker Desktop

## Quick start (recommended)
```bash
./scripts/setup.sh
```
Then open http://localhost:3000

## Manual start
```bash
docker compose up --build
docker compose exec ollama ollama pull llava:latest
```

### Optional: use OpenAI instead of Ollama
Set these env vars (e.g., in `.env`):
- `PROVIDER=openai`
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-4o-mini` (default)

## Performance notes
- First run downloads a large model; allow a few minutes on first pull.
- Inference on CPU laptops can take ~30–120s, faster after the first request once the model is warm.
- Smaller images process faster; the server resizes oversized uploads to help.

## Troubleshooting
- **Model not found**: ensure `OLLAMA_MODEL` matches a pulled model (default `llava:latest`); run the pull command above.
- **Ollama unreachable**: confirm containers are running and port 11434 is free; check `docker compose logs -f ollama`.
- **Docker not running**: start Docker Desktop, then rerun the commands.

## Tech stack
- Node.js / Express
- Ollama (vision model, default `llava:latest`)
- Docker Compose

## License
MIT (see LICENSE)
