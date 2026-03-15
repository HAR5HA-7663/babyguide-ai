"""
Gemini Live API client wrapper.

Audio: gemini-2.5-flash-native-audio-latest (bidiGenerateContent, audio-only)
Vision: gemini-2.5-flash (generateContent, periodic frame analysis injected as text)

The multimodal live models (gemini-2.0-flash-live) are not available on the
Google AI Studio v1beta API. We work around this with a hybrid approach:
  - Live session handles real-time voice conversation
  - A background vision loop analyzes camera frames every ~3 s using the
    standard generateContent API and injects the description as context text
    into the live session so the voice model has accurate visual awareness.
"""

import asyncio
import base64
import json
import logging
import os
from typing import AsyncGenerator, Optional

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are BabyGuide AI — a compassionate, expert parenting assistant for first-time parents.

BABY PROFILE: {baby_profile}

HOW VISION WORKS:
You do NOT have a continuous live camera feed. When the parent's camera detects something relevant,
you will receive a message starting with "[Camera shows]" describing exactly what is visible.
CRITICAL: NEVER describe, comment on, or reference the camera unless you have received a "[Camera shows]" message.
If asked "what do you see?", say honestly: "I can see the camera feed when your baby is in frame — try pointing the camera at your baby."
Only use visual context from "[Camera shows]" messages — never invent or guess what the camera shows.

YOUR ROLE:
- Provide calm, reassuring, evidence-based guidance grounded in AAP (American Academy of Pediatrics) guidelines
- When you receive "[Camera shows]" context, give specific visual guidance based on exactly what was described
- Be conversational, warm, and supportive — new parents are often anxious and sleep-deprived
- Always recommend consulting a pediatrician for medical concerns

RESPONSE FORMAT — CRITICAL:
- Speak naturally as if talking to a parent. Never include internal reasoning, assessments, or meta-commentary.
- Never output text like "Assessing Visual Context", "I need to...", "The user has...", or any third-person self-analysis.
- Never use markdown formatting (no **bold**, no bullet points) — this is a voice conversation.
- If you have no visual context, simply say so conversationally: "Point the camera at what you'd like help with and I'll take a look."

AR OVERLAY INSTRUCTIONS:
Only include AR overlays when you have received a "[Camera shows]" message with actual visual context.
NEVER include AR overlays without real visual context — do not invent positions or objects.
When you DO have visual context, format your response as:
<natural speech response here>

```json
{{
  "overlays": [
    {{
      "type": "arrow",
      "target_description": "baby's left arm",
      "text": "Tuck arm here",
      "color": "#4ADE80",
      "priority": 1
    }},
    {{
      "type": "highlight_box",
      "target_description": "measurement line on bottle",
      "text": "Fill to 4oz line",
      "color": "#60A5FA",
      "priority": 2
    }},
    {{
      "type": "checklist",
      "items": [
        {{"label": "Hungry?", "hint": "Last fed 2+ hours ago", "checked": false}},
        {{"label": "Wet diaper?", "hint": "Check and change", "checked": false}},
        {{"label": "Overtired?", "hint": "Look for eye rubbing", "checked": false}}
      ],
      "priority": 1
    }},
    {{
      "type": "step_indicator",
      "current_step": 2,
      "total_steps": 5,
      "step_label": "Fold top corner down",
      "priority": 1
    }},
    {{
      "type": "info_panel",
      "title": "Feeding Schedule",
      "content": "Every 2-3 hours at {age}",
      "priority": 2
    }}
  ]
}}
```

OVERLAY TYPES:
- "arrow": Points to a specific object in view with guidance text
- "highlight_box": Highlights a region (bottle line, diaper area, etc.)
- "checklist": Interactive checklist panel (cry diagnosis, safety check)
- "step_indicator": Current step in a multi-step process
- "info_panel": Informational panel with title and content

SAFETY RULES:
- Never diagnose medical conditions
- Always add disclaimer for medical questions: "Please consult your pediatrician"
- Safe sleep: always recommend back-sleeping, firm mattress, no loose items
- Never recommend medications without pediatrician guidance
"""


class GeminiLiveClient:
    def __init__(self, session_id: str, baby_profile: dict):
        self.session_id = session_id
        self.baby_profile = baby_profile
        self.client: Optional[genai.Client] = None

        # Queues for inter-task communication
        self._send_queue: asyncio.Queue = asyncio.Queue()
        self._response_queue: asyncio.Queue = asyncio.Queue()

        self._connected = False
        self._ready = asyncio.Event()   # set once Gemini WS is established
        self._session_task: Optional[asyncio.Task] = None
        self._vision_task: Optional[asyncio.Task] = None
        self._live_session = None       # set once async with session is entered

        # Vision: latest JPEG frame + flag indicating it hasn't been analyzed yet
        self._latest_frame: Optional[bytes] = None
        self._frame_fresh: bool = False
        self._vision_interval: int = 3        # seconds between analyses
        self._last_injected: str = ""         # last description that was injected
        self._injection_cooldown: int = 20    # seconds to wait after an injection

        # Format baby profile for system prompt
        profile_str = self._format_profile(baby_profile)
        self.system_prompt = SYSTEM_PROMPT.format(
            baby_profile=profile_str,
            age=self._age_string(baby_profile.get("age_weeks", 0)),
        )

    def _format_profile(self, profile: dict) -> str:
        if not profile:
            return "Unknown (no profile set)"
        name = profile.get("baby_name", "Baby")
        weeks = profile.get("age_weeks", 0)
        weight = profile.get("weight_kg")
        conditions = profile.get("conditions", [])
        parts = [f"Name: {name}", f"Age: {self._age_string(weeks)}"]
        if weight:
            parts.append(f"Weight: {weight}kg")
        if conditions:
            parts.append(f"Conditions: {', '.join(conditions)}")
        return " | ".join(parts)

    def _age_string(self, weeks: int) -> str:
        if weeks < 4:
            return f"{weeks} week{'s' if weeks != 1 else ''} old"
        months = weeks // 4
        return f"{months} month{'s' if months != 1 else ''} old"

    async def connect(self):
        """Initialize Gemini Live API session as a background task."""
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set")

        self.client = genai.Client(api_key=api_key)
        self._connected = True

        # Run the entire session lifecycle inside a single async-with block.
        # This keeps the WebSocket alive and ensures ping/pong is handled.
        self._session_task = asyncio.create_task(self._run_session())

        # Wait until the Gemini WebSocket is actually established (or fails)
        try:
            await asyncio.wait_for(self._ready.wait(), timeout=15.0)
        except asyncio.TimeoutError:
            raise RuntimeError("Timed out waiting for Gemini Live connection")

        logger.info(f"Gemini Live session ready: {self.session_id}")

        # Start vision loop as an independent task so it never gets cancelled
        # by session send/receive errors
        self._vision_task = asyncio.create_task(self._vision_loop_task())

    async def _run_session(self):
        """Single task that owns the Gemini session for its entire lifetime."""
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=self.system_prompt,
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Charon")
                )
            ),
        )

        try:
            async with self.client.aio.live.connect(
                model="gemini-2.5-flash-native-audio-latest",
                config=config,
            ) as session:
                logger.info(f"Gemini Live WebSocket connected: {self.session_id}")
                self._ready.set()   # unblock connect()

                # Store session reference for the independent vision task
                self._live_session = session

                # Run send and receive loops concurrently within the session context
                await asyncio.gather(
                    self._send_loop(session),
                    self._receive_loop(session),
                )
        except Exception as e:
            logger.error(f"Gemini session error ({self.session_id}): {e}", exc_info=True)
            self._ready.set()   # unblock connect() if it's still waiting
            await self._response_queue.put({"type": "error", "message": str(e)})
        finally:
            self._connected = False
            logger.info(f"Gemini session ended: {self.session_id}")

    async def _send_loop(self, session):
        """Drain the send queue and forward messages to Gemini."""
        while self._connected:
            try:
                msg = await asyncio.wait_for(self._send_queue.get(), timeout=0.5)
                kind = msg.get("kind")

                if kind == "audio":
                    await session.send_realtime_input(
                        media=types.Blob(data=msg["data"], mime_type="audio/pcm;rate=16000")
                    )
                elif kind == "text":
                    await session.send_client_content(
                        turns=types.Content(parts=[types.Part(text=msg["text"])], role="user"),
                        turn_complete=True,
                    )
                elif kind == "interrupt":
                    await session.send_realtime_input(audio_stream_end=True)
                elif kind == "stop":
                    break

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.warning(f"_send_loop error: {e}")

    async def _receive_loop(self, session):
        """Continuously receive from Gemini and put responses in the queue.

        session.receive() is an async generator that breaks on turn_complete,
        so we restart it in a while loop to keep the WebSocket recv() running
        (required for ping/pong keepalive in websockets 15.x).
        """
        try:
            while self._connected:
                async for response in session.receive():
                    if not self._connected:
                        return

                    if response.server_content:
                        content = response.server_content

                        if content.interrupted:
                            await self._response_queue.put({"type": "interrupted"})

                        if content.model_turn:
                            for part in content.model_turn.parts:
                                if part.inline_data:
                                    await self._response_queue.put({
                                        "type": "audio",
                                        "data": part.inline_data.data,
                                    })
                                if part.text:
                                    await self._response_queue.put({
                                        "type": "text",
                                        "text": part.text,
                                    })

        except Exception as e:
            logger.error(f"_receive_loop error: {e}", exc_info=True)
            await self._response_queue.put({"type": "error", "message": str(e)})

    async def disconnect(self):
        self._connected = False
        if self._vision_task:
            self._vision_task.cancel()
            self._vision_task = None
        # Signal the send loop to stop
        await self._send_queue.put({"kind": "stop"})
        if self._session_task:
            try:
                await asyncio.wait_for(self._session_task, timeout=3.0)
            except (asyncio.TimeoutError, Exception):
                self._session_task.cancel()
            self._session_task = None

    async def send_audio(self, pcm_bytes: bytes):
        if not self._connected:
            return
        await self._send_queue.put({"kind": "audio", "data": pcm_bytes})

    def update_frame(self, jpeg_bytes: bytes):
        """Store the latest camera frame for vision analysis."""
        self._latest_frame = jpeg_bytes
        self._frame_fresh = True

    async def send_video_frame(self, jpeg_bytes: bytes):
        """Accept frames from the WebSocket handler; store for vision loop."""
        self.update_frame(jpeg_bytes)

    async def _vision_loop_task(self):
        """Independent task: analyze camera frames and inject visual context.

        Runs outside the Gemini session gather so session errors don't kill it.
        Only injects when a baby is actually visible — stays silent otherwise.
        """
        vision_prompt = (
            "This is a camera frame from a baby care assistant app. "
            "Describe what you see in 1-3 sentences. Be factual and specific. "
            "Mention: any baby or child (position, activity, apparent state), "
            "any products (medicine bottles, formula cans, bottles, creams — read visible labels/brand names), "
            "any baby gear (crib, stroller, carrier, swaddle), "
            "or any other objects relevant to infant care. "
            "If the frame shows nothing relevant to baby care (e.g. blank wall, ceiling, floor with no objects), "
            "respond with exactly: NONE"
        )

        logger.info("Vision loop started")

        first_run = True
        while self._connected:
            # Skip sleep on first iteration — analyze as soon as a frame arrives
            if not first_run:
                await asyncio.sleep(self._vision_interval)
            first_run = False

            if not self._connected:
                break

            if not self._frame_fresh or not self._latest_frame:
                logger.debug("Vision loop: no new frame, skipping")
                continue

            jpeg_bytes = self._latest_frame
            self._frame_fresh = False

            session = self._live_session
            if session is None:
                logger.debug("Vision loop: session not ready yet")
                continue

            logger.info(f"Vision loop: analyzing frame ({len(jpeg_bytes)} bytes)")

            try:
                image_part = types.Part.from_bytes(data=jpeg_bytes, mime_type="image/jpeg")
                text_part = types.Part(text=vision_prompt)
                contents = types.Content(parts=[image_part, text_part], role="user")

                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None,
                    lambda: self.client.models.generate_content(
                        model="gemini-2.5-flash",
                        contents=[contents],
                    ),
                )
                description = (response.text or "").strip()
                logger.info(f"Vision result: '{description[:200]}'")

                if description and description.strip().upper() != "NONE" and len(description) > 8:
                    # Skip if the scene hasn't meaningfully changed since last injection
                    # (simple word-overlap check — avoids spamming the same context)
                    new_words = set(description.lower().split())
                    old_words = set(self._last_injected.lower().split())
                    overlap = len(new_words & old_words) / max(len(new_words), 1)
                    if overlap > 0.7 and self._last_injected:
                        logger.debug("Vision: scene unchanged, skipping injection")
                    else:
                        context_msg = (
                            f"[Camera shows] {description} "
                            f"(Silent context update — do not acknowledge or repeat this. "
                            f"Use it only if the parent asks about what you see or about the object.)"
                        )
                        logger.info("Injecting vision context into session")
                        self._last_injected = description
                        await session.send_client_content(
                            turns=types.Content(
                                parts=[types.Part(text=context_msg)],
                                role="user",
                            ),
                            turn_complete=True,
                        )
                        # Cool down — don't analyze again for a while so the model
                        # doesn't get spammed with repeated context turns
                        await asyncio.sleep(self._injection_cooldown)

            except Exception as e:
                logger.warning(f"Vision analysis failed: {e}", exc_info=True)

        logger.info("Vision loop stopped")

    async def send_text(self, text: str):
        if not self._connected:
            return
        await self._send_queue.put({"kind": "text", "text": text})

    async def interrupt(self):
        if not self._connected:
            return
        await self._send_queue.put({"kind": "interrupt"})

    async def receive_responses(self) -> AsyncGenerator[dict, None]:
        """Yield responses from the queue."""
        while self._connected:
            try:
                response = await asyncio.wait_for(
                    self._response_queue.get(), timeout=0.1
                )
                yield response
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error receiving response: {e}")
                break
