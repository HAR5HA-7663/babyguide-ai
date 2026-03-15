"""
Annotation Engine — parses Gemini text responses to extract AR overlay JSON.
"""

import json
import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Regex to find ```json ... ``` blocks in Gemini responses
_JSON_BLOCK_RE = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL)


class AnnotationEngine:
    def extract_overlays(self, text: str) -> list[dict]:
        """
        Extract overlay JSON from a Gemini text response.
        Returns list of overlay dicts, or empty list if none found.
        """
        match = _JSON_BLOCK_RE.search(text)
        if not match:
            return []

        try:
            data = json.loads(match.group(1))
            overlays = data.get("overlays", [])
            return self._validate_overlays(overlays)
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse annotation JSON: {e}")
            return []

    def strip_json_from_text(self, text: str) -> str:
        """Remove JSON block and internal reasoning leaks from text."""
        clean = _JSON_BLOCK_RE.sub("", text).strip()
        # Strip lines that are markdown bold headers — these are reasoning artifacts
        # e.g. "**Acknowledge Visual Input**" or "**Assessing Context**"
        clean = re.sub(r"^\*\*[^*]+\*\*\s*", "", clean, flags=re.MULTILINE)
        # Strip lines starting with internal meta-patterns
        clean = re.sub(r"^(I need to|The user has|I'm currently|I must|Let me assess)[^\n]*\n?", "", clean, flags=re.MULTILINE | re.IGNORECASE)
        # Collapse multiple blank lines
        clean = re.sub(r"\n{3,}", "\n\n", clean)
        return clean.strip()

    def _validate_overlays(self, overlays: list) -> list[dict]:
        """Validate and normalise overlay entries."""
        valid = []
        allowed_types = {"arrow", "highlight_box", "checklist", "step_indicator", "info_panel"}

        for item in overlays:
            if not isinstance(item, dict):
                continue
            overlay_type = item.get("type")
            if overlay_type not in allowed_types:
                continue

            # Ensure required fields per type
            if overlay_type == "arrow":
                if not item.get("target_description"):
                    continue
                item.setdefault("color", "#4ADE80")
                item.setdefault("text", "")

            elif overlay_type == "highlight_box":
                if not item.get("target_description"):
                    continue
                item.setdefault("color", "#60A5FA")
                item.setdefault("text", "")

            elif overlay_type == "checklist":
                if not isinstance(item.get("items"), list):
                    continue

            elif overlay_type == "step_indicator":
                item.setdefault("current_step", 1)
                item.setdefault("total_steps", 1)
                item.setdefault("step_label", "")

            elif overlay_type == "info_panel":
                if not item.get("title"):
                    continue

            item.setdefault("priority", 1)
            valid.append(item)

        # Sort by priority (lower = higher importance)
        valid.sort(key=lambda x: x.get("priority", 99))
        return valid

    def build_swaddle_demo_overlays(self) -> list[dict]:
        """Return demo overlays for the swaddling scenario (for testing)."""
        return [
            {
                "type": "step_indicator",
                "current_step": 1,
                "total_steps": 5,
                "step_label": "Lay blanket in diamond shape",
                "priority": 1,
            },
            {
                "type": "arrow",
                "target_description": "top corner of blanket",
                "text": "Fold down 6 inches",
                "color": "#4ADE80",
                "priority": 2,
            },
        ]

    def build_cry_diagnosis_overlays(self) -> list[dict]:
        """Return demo overlays for cry diagnosis scenario."""
        return [
            {
                "type": "checklist",
                "items": [
                    {"label": "Hungry?", "hint": "Last fed 2+ hours ago", "checked": False},
                    {"label": "Wet diaper?", "hint": "Check and change", "checked": False},
                    {"label": "Overtired?", "hint": "Look for eye rubbing", "checked": False},
                    {"label": "Gas/discomfort?", "hint": "Tummy feels hard", "checked": False},
                    {"label": "Needs comfort?", "hint": "Try skin-to-skin", "checked": False},
                ],
                "priority": 1,
            }
        ]
