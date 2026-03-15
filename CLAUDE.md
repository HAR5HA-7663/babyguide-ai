# BabyGuide AI — CLAUDE.md

## Project Overview
BabyGuide AI is a real-time parenting assistant for first-time parents, built for the
**Gemini Live Agent Challenge**. It uses Gemini Live API for bidirectional voice + vision,
with AR overlays on a live camera feed.

**Tagline:** "Your 24/7 visual guide through parenthood — point, ask, and get help live."

## Architecture
```
Browser (React/Vite) ──WebSocket──▶ FastAPI (Cloud Run)
  - WebRTC camera + mic             - Gemini Live API client
  - Canvas AR overlay               - Annotation engine (JSON overlays)
  - Audio playback (Web Audio)      - Session manager (Firestore/memory)
                                    - ADK agent (tools: feeding, sleep, milestones)
```

## Quick Start

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env: add GEMINI_API_KEY
uvicorn main:app --reload --port 8080
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

## Key Files
| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI app + WebSocket endpoint |
| `backend/gemini_live.py` | Gemini Live API client (audio/video streaming) |
| `backend/annotation_engine.py` | Parses Gemini responses → AR overlay JSON |
| `backend/session_manager.py` | Baby profile storage (memory or Firestore) |
| `backend/agent/babyguide_agent.py` | ADK agent with feeding/sleep/milestone tools |
| `frontend/src/App.tsx` | Main app orchestration |
| `frontend/src/hooks/useGeminiLive.ts` | WebSocket client hook |
| `frontend/src/hooks/useAROverlay.ts` | Canvas AR rendering hook |
| `frontend/src/components/VideoFeed.tsx` | WebRTC + frame capture |
| `infrastructure/main.tf` | Terraform IaC for GCP resources |

## AR Overlay Protocol
Gemini is instructed (via system prompt) to ALWAYS include a JSON block in text responses:
```
Natural speech text here...

```json
{
  "overlays": [
    {"type": "arrow", "target_description": "...", "text": "...", "color": "#4ADE80"},
    {"type": "step_indicator", "current_step": 1, "total_steps": 5, "step_label": "..."},
    {"type": "checklist", "items": [{"label": "...", "hint": "...", "checked": false}]},
    {"type": "highlight_box", "target_description": "...", "text": "...", "color": "#60A5FA"},
    {"type": "info_panel", "title": "...", "content": "..."}
  ]
}
\```
```
The `annotation_engine.py` extracts this JSON, strips it from the text response,
and sends `{"type": "annotations", "overlays": [...]}` to the frontend separately.

## WebSocket Message Protocol
### Client → Server
```json
{"type": "audio_chunk",  "data": "<base64 PCM 16kHz mono>"}
{"type": "video_frame",  "data": "<base64 JPEG>"}
{"type": "text_message", "text": "..."}
{"type": "interrupt"}
{"type": "end_session"}
```
### Server → Client
```json
{"type": "session_ready"}
{"type": "audio_chunk",   "data": "<base64 PCM 24kHz>"}
{"type": "text_response", "text": "..."}
{"type": "annotations",   "overlays": [...]}
{"type": "interrupted"}
{"type": "error",         "message": "..."}
```

## GCP Deployment
```bash
# Build and push Docker image
cd backend
gcloud builds submit --tag gcr.io/PROJECT_ID/babyguide-backend

# Deploy to Cloud Run
gcloud run deploy babyguide-backend \
  --image gcr.io/PROJECT_ID/babyguide-backend \
  --region us-central1 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars USE_FIRESTORE=true,GOOGLE_CLOUD_PROJECT=PROJECT_ID

# Or use Terraform
cd infrastructure
terraform init
terraform apply -var="project_id=YOUR_PROJECT" -var="gemini_api_key=YOUR_KEY"
```

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Gemini API key |
| `GOOGLE_CLOUD_PROJECT` | Prod only | GCP project ID |
| `USE_FIRESTORE` | No | `true` to enable Firestore (default: in-memory) |
| `GCS_BUCKET_NAME` | No | Cloud Storage bucket for session recordings |

## Demo Scenarios
1. **Swaddling** — AR step indicators + arrows on baby/blanket
2. **Formula prep** — AR highlight box on measurement line + feeding schedule panel
3. **Cry diagnosis** — AR checklist overlay (hungry/wet/tired/gas)
4. **Diaper change** — Step-by-step AR indicators
5. **Medicine scan** — Show bottle → safety check for baby's age
6. **Sleep safety** — Camera on crib → AR safety checklist

## Safety Principles
- All advice grounded in AAP (American Academy of Pediatrics) guidelines
- Gemini system prompt includes explicit medical disclaimer rules
- Never diagnose; always recommend pediatrician for medical concerns
- Safe sleep rules enforced in every sleep-related response

## Coding Conventions
- Python: type hints throughout, async/await for all I/O
- TypeScript: strict mode, no `any`
- Components: functional with hooks, no class components
- Overlays cleared automatically after 10s of no new annotations
