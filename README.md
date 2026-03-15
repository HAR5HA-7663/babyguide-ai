# BabyGuide AI

**Point your camera at the situation. Ask. Get real-time visual help.**

A live voice + AR assistant for first-time parents, built on Gemini Live API. You hold up the camera, it sees what you're dealing with — a swaddle that's going sideways, a bottle you're not sure how to fill, a crying baby you can't read — and walks you through it with arrows and overlays on the actual screen, while talking to you.

Built for the [Gemini Live Agent Challenge](https://ai.google.dev) — Live Agents category.

---

## What it does

Six scenarios work out of the box:

| Tap this | What happens |
|----------|-------------|
| Swaddling | Step counter + arrows on the blanket and baby |
| Formula prep | Highlights the measurement line on your bottle |
| Cry diagnosis | Checklist overlay — hungry, wet, tired, gas — walks through each one |
| Diaper change | Step-by-step guide on the actual objects in front of you |
| Medicine scan | Point at the bottle, ask if it's safe for your baby's age |
| Sleep safety | Checks the crib against AAP safe sleep rules |

You can interrupt it mid-sentence. It adapts. That part matters more than it sounds at 2am.

---

## How it works

```
Browser
  ├── WebRTC  →  camera + mic
  ├── Canvas  →  AR overlays drawn on top of the video
  └── WebSocket
            │
            ▼
       FastAPI (Cloud Run)
            ├── Gemini Live API  (audio in/out + video frames)
            ├── Annotation engine  (pulls JSON overlays out of responses)
            └── ADK agent  (feeding schedules, sleep guidelines, milestones)
```

Gemini is instructed to always return two things: a voice response and a JSON block describing what to draw. The annotation engine strips the JSON, sends the clean audio response to the speaker, and forwards the overlay instructions to the canvas.

---

## Stack

**Backend:** Python, FastAPI, Google GenAI SDK, Google ADK, Firestore
**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Web Audio API
**Infrastructure:** Cloud Run, Firebase Hosting, Firestore, Cloud Storage, Secret Manager, Terraform

---

## Run it locally

### What you need first

- Python 3.12+
- Node.js 20+
- A Gemini API key — get one free at [aistudio.google.com](https://aistudio.google.com)

### Backend

```bash
cd backend
python -m venv .venv

# Mac/Linux:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate

pip install -r requirements.txt

# Create your .env file
cp .env.example .env
# Open .env and paste your GEMINI_API_KEY

uvicorn main:app --reload --port 8080
```

You should see `BabyGuide AI backend starting...` and the server running on port 8080.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. The Vite proxy forwards `/api` and `/ws` to the backend automatically.

---

## Deploy to Google Cloud

Full deployment uses Cloud Run for the backend and Firebase Hosting for the frontend.

### 1. Set up your GCP project

```bash
# Install gcloud if you haven't already
# https://cloud.google.com/sdk/docs/install

gcloud auth login
gcloud projects create YOUR_PROJECT_ID
gcloud config set project YOUR_PROJECT_ID

# Enable billing on the project (required for Cloud Run)
# https://console.cloud.google.com/billing
```

### 2. Store your API key in Secret Manager

```bash
gcloud services enable secretmanager.googleapis.com

echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --replication-policy=automatic
```

### 3. Deploy the backend to Cloud Run

```bash
cd backend

# Build and push the container
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/babyguide-backend

# Deploy
gcloud run deploy babyguide-backend \
  --image gcr.io/YOUR_PROJECT_ID/babyguide-backend \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars USE_FIRESTORE=true,GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID \
  --allow-unauthenticated
```

Copy the URL it gives you (looks like `https://babyguide-backend-xxxx-uc.a.run.app`).

### 4. Deploy the frontend to Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # select your project, set public dir to "dist"

cd frontend

# Paste your Cloud Run URL into the build
VITE_BACKEND_URL=https://babyguide-backend-xxxx-uc.a.run.app \
VITE_BACKEND_WS=wss://babyguide-backend-xxxx-uc.a.run.app \
npm run build

firebase deploy --only hosting
```

### 5. (Optional) Terraform for everything at once

```bash
cd infrastructure
terraform init

terraform apply \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="gemini_api_key=YOUR_GEMINI_KEY"
```

This provisions Cloud Run, Firestore, Cloud Storage, Secret Manager, and service accounts.

---

## Firestore (optional for local dev)

By default the backend uses an in-memory store so you don't need any GCP setup to run locally.

To use Firestore:
```bash
# In your .env:
USE_FIRESTORE=true
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID

# Authenticate locally
gcloud auth application-default login
```

---

## Project layout

```
babyguide-ai/
├── backend/
│   ├── main.py                  # FastAPI + WebSocket
│   ├── gemini_live.py           # Gemini Live API client
│   ├── annotation_engine.py     # Extracts AR overlay JSON from responses
│   ├── session_manager.py       # Baby profile storage
│   ├── agent/
│   │   └── babyguide_agent.py   # ADK agent with feeding/sleep/milestone tools
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── types.ts
│   │   ├── components/
│   │   │   ├── VideoFeed.tsx    # WebRTC + JPEG frame capture
│   │   │   ├── AROverlay.tsx    # Canvas overlay component
│   │   │   ├── VoiceInput.tsx   # Mic capture + PCM streaming
│   │   │   ├── StatusBar.tsx
│   │   │   ├── QuickActions.tsx
│   │   │   └── Onboarding.tsx
│   │   └── hooks/
│   │       ├── useGeminiLive.ts
│   │       └── useAROverlay.ts
│   └── package.json
├── infrastructure/
│   ├── main.tf
│   └── cloudbuild.yaml
└── CLAUDE.md
```

---

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `GEMINI_API_KEY` | Yes | From aistudio.google.com |
| `GOOGLE_CLOUD_PROJECT` | Production only | Your GCP project ID |
| `USE_FIRESTORE` | No | `true` to use Firestore, otherwise in-memory |
| `GCS_BUCKET_NAME` | No | For session recordings |

---

## A note on safety

Everything is grounded in AAP (American Academy of Pediatrics) guidelines. The system prompt explicitly blocks medical diagnosis and adds a reminder to consult a pediatrician for anything beyond basic guidance. Safe sleep rules are enforced unconditionally — back sleeping, firm surface, nothing loose in the crib.

This is a parenting aid, not a doctor.

---

*#GeminiLiveAgentChallenge*
