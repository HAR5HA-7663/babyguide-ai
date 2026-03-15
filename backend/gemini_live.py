"""
Gemini Live API client wrapper.
Handles bidirectional audio/video streaming with gemini-2.0-flash-live.
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
You have access to the parent's live camera feed and microphone.

BABY PROFILE: {baby_profile}

YOUR ROLE:
- Provide calm, reassuring, evidence-based guidance grounded in AAP (American Academy of Pediatrics) guidelines
- Watch the camera feed and give specific instructions based on what you actually see
- Be conversational, warm, and supportive — new parents are often anxious and sleep-deprived
- Always recommend consulting a pediatrician for medical concerns

AR OVERLAY INSTRUCTIONS:
With EVERY visual response, you MUST include a JSON block for AR annotations.
Format your response as:
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
        self.session = None
        self._response_queue: asyncio.Queue = asyncio.Queue()
        self._connected = False

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
        """Initialize Gemini Live API session."""
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set")

        self.client = genai.Client(api_key=api_key)

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO", "TEXT"],
            system_instruction=types.Content(
                parts=[types.Part(text=self.system_prompt)],
                role="system",
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                )
            ),
        )

        self.session = await self.client.aio.live.connect(
            model="gemini-2.0-flash-live-001",
            config=config,
        ).__aenter__()

        self._connected = True
        # Start background task to drain responses into queue
        asyncio.create_task(self._drain_responses())
        logger.info(f"Gemini Live session connected: {self.session_id}")

    async def disconnect(self):
        self._connected = False
        if self.session:
            try:
                await self.session.__aexit__(None, None, None)
            except Exception:
                pass

    async def send_audio(self, pcm_bytes: bytes):
        """Send raw PCM audio (16kHz, 16-bit, mono) to Gemini."""
        if not self.session:
            return
        await self.session.send(
            input=types.LiveClientRealtimeInput(
                media_chunks=[
                    types.Blob(data=pcm_bytes, mime_type="audio/pcm;rate=16000")
                ]
            )
        )

    async def send_video_frame(self, jpeg_bytes: bytes):
        """Send a JPEG video frame to Gemini."""
        if not self.session:
            return
        await self.session.send(
            input=types.LiveClientRealtimeInput(
                media_chunks=[
                    types.Blob(data=jpeg_bytes, mime_type="image/jpeg")
                ]
            )
        )

    async def send_text(self, text: str):
        """Send a text message turn to Gemini."""
        if not self.session:
            return
        await self.session.send(
            input=types.LiveClientContent(
                turns=[
                    types.Content(
                        parts=[types.Part(text=text)],
                        role="user",
                    )
                ],
                turn_complete=True,
            )
        )

    async def interrupt(self):
        """Signal an interruption (barge-in)."""
        if not self.session:
            return
        # Send empty audio chunk to signal interruption
        await self.session.send(
            input=types.LiveClientRealtimeInput(media_chunks=[])
        )

    async def _drain_responses(self):
        """Background task: drain Gemini responses into the queue."""
        try:
            async for response in self.session.receive():
                if not self._connected:
                    break

                if response.server_content:
                    content = response.server_content

                    if content.interrupted:
                        await self._response_queue.put({"type": "interrupted"})

                    if content.model_turn:
                        for part in content.model_turn.parts:
                            if part.inline_data:
                                # Audio response
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
            logger.error(f"Error draining Gemini responses: {e}", exc_info=True)
            await self._response_queue.put({"type": "error", "message": str(e)})

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
