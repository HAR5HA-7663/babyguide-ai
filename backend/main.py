"""
BabyGuide AI — FastAPI WebSocket server
Handles bidirectional audio/video streaming with Gemini Live API.
"""

import asyncio
import base64
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from gemini_live import GeminiLiveClient
from session_manager import SessionManager
from annotation_engine import AnnotationEngine

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("BabyGuide AI backend starting...")
    yield
    logger.info("BabyGuide AI backend shutting down.")


app = FastAPI(
    title="BabyGuide AI Backend",
    description="Real-time parenting assistant powered by Gemini Live API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_manager = SessionManager()
annotation_engine = AnnotationEngine()


# ─── REST Endpoints ───────────────────────────────────────────────────────────

class BabyProfile(BaseModel):
    baby_name: str
    age_weeks: int
    weight_kg: Optional[float] = None
    conditions: Optional[list[str]] = []


@app.post("/api/session/create")
async def create_session(profile: BabyProfile):
    """Create a new session with baby profile context."""
    session_id = await session_manager.create_session(profile.model_dump())
    return {"session_id": session_id, "status": "created"}


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """Retrieve session data including baby profile."""
    data = await session_manager.get_session(session_id)
    if not data:
        raise HTTPException(status_code=404, detail="Session not found")
    return data


@app.delete("/api/session/{session_id}")
async def delete_session(session_id: str):
    await session_manager.delete_session(session_id)
    return {"status": "deleted"}


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "babyguide-ai"}


# ─── WebSocket Endpoint ───────────────────────────────────────────────────────

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    Main bidirectional WebSocket for Gemini Live streaming.

    Client → Server messages (JSON):
      { "type": "audio_chunk",  "data": "<base64 PCM 16kHz mono>" }
      { "type": "video_frame",  "data": "<base64 JPEG>" }
      { "type": "text_message", "text": "..." }
      { "type": "interrupt" }
      { "type": "end_session" }

    Server → Client messages (JSON):
      { "type": "audio_chunk",    "data": "<base64 PCM 24kHz>" }
      { "type": "annotations",    "overlays": [...] }
      { "type": "text_response",  "text": "..." }
      { "type": "session_ready" }
      { "type": "error",          "message": "..." }
    """
    await websocket.accept()
    logger.info(f"WebSocket connected: session={session_id}")

    session_data = await session_manager.get_session(session_id)
    if not session_data:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    baby_profile = session_data.get("baby_profile", {})
    gemini_client = GeminiLiveClient(
        session_id=session_id,
        baby_profile=baby_profile,
    )

    try:
        await gemini_client.connect()
        await websocket.send_json({"type": "session_ready"})
        logger.info(f"Gemini Live connected for session={session_id}")

        # Run send and receive loops concurrently
        await asyncio.gather(
            _receive_from_client(websocket, gemini_client, session_id),
            _send_to_client(websocket, gemini_client, session_id),
        )

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"WebSocket error session={session_id}: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        await gemini_client.disconnect()
        logger.info(f"Gemini client disconnected for session={session_id}")


async def _receive_from_client(
    websocket: WebSocket,
    gemini_client: "GeminiLiveClient",
    session_id: str,
):
    """Forward client messages to Gemini Live."""
    async for raw in websocket.iter_text():
        try:
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "audio_chunk":
                audio_bytes = base64.b64decode(msg["data"])
                await gemini_client.send_audio(audio_bytes)

            elif msg_type == "video_frame":
                frame_bytes = base64.b64decode(msg["data"])
                await gemini_client.send_video_frame(frame_bytes)

            elif msg_type == "text_message":
                await gemini_client.send_text(msg["text"])

            elif msg_type == "interrupt":
                await gemini_client.interrupt()

            elif msg_type == "end_session":
                break

        except Exception as e:
            logger.error(f"Error processing client message: {e}")


async def _send_to_client(
    websocket: WebSocket,
    gemini_client: "GeminiLiveClient",
    session_id: str,
):
    """Forward Gemini responses to client, enriching with AR annotations."""
    async for response in gemini_client.receive_responses():
        try:
            if response["type"] == "audio":
                await websocket.send_json({
                    "type": "audio_chunk",
                    "data": base64.b64encode(response["data"]).decode(),
                })

            elif response["type"] == "text":
                text = response["text"]
                # Parse annotation JSON embedded in text response
                overlays = annotation_engine.extract_overlays(text)
                clean_text = annotation_engine.strip_json_from_text(text)

                await websocket.send_json({
                    "type": "text_response",
                    "text": clean_text,
                })

                if overlays:
                    await websocket.send_json({
                        "type": "annotations",
                        "overlays": overlays,
                    })

            elif response["type"] == "interrupted":
                await websocket.send_json({"type": "interrupted"})

        except Exception as e:
            logger.error(f"Error sending to client: {e}")
