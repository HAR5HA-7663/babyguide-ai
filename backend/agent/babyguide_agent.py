"""
BabyGuide ADK Agent definition.
Uses Google Agent Development Kit for orchestration.
"""

import os
from google.adk.agents import Agent
from google.adk.tools import FunctionTool


def get_feeding_schedule(age_weeks: int) -> dict:
    """
    Returns recommended feeding schedule based on baby's age.

    Args:
        age_weeks: Baby's age in weeks

    Returns:
        Feeding schedule with frequency and amount recommendations
    """
    if age_weeks <= 4:
        return {
            "frequency": "Every 2-3 hours (8-12 times/day)",
            "amount": "1-3 oz per feeding",
            "daily_total": "16-24 oz",
            "notes": "Newborns have tiny stomachs — feed on demand",
        }
    elif age_weeks <= 12:
        return {
            "frequency": "Every 3-4 hours (6-8 times/day)",
            "amount": "3-4 oz per feeding",
            "daily_total": "18-32 oz",
            "notes": "Watch for hunger cues: rooting, sucking motions, fussiness",
        }
    elif age_weeks <= 24:
        return {
            "frequency": "Every 4-5 hours (5-6 times/day)",
            "amount": "4-6 oz per feeding",
            "daily_total": "24-36 oz",
            "notes": "May start solid foods around 4-6 months with pediatrician guidance",
        }
    else:
        return {
            "frequency": "Every 4-5 hours (4-5 times/day)",
            "amount": "6-8 oz per feeding",
            "daily_total": "24-40 oz",
            "notes": "Introduce iron-rich solids; breast milk/formula remains primary nutrition",
        }


def get_sleep_guidelines(age_weeks: int) -> dict:
    """
    Returns AAP safe sleep guidelines for baby's age.

    Args:
        age_weeks: Baby's age in weeks

    Returns:
        Sleep guidelines and recommended hours
    """
    if age_weeks <= 12:
        total = "14-17 hours/day"
    elif age_weeks <= 24:
        total = "12-16 hours/day"
    elif age_weeks <= 52:
        total = "12-14 hours/day"
    else:
        total = "11-14 hours/day"

    return {
        "total_sleep": total,
        "safe_sleep_rules": [
            "Always place baby on their BACK to sleep",
            "Use a firm, flat sleep surface",
            "No loose bedding, bumpers, or soft objects in crib",
            "Room-sharing (not bed-sharing) for at least 6 months",
            "Keep room at 68-72°F (20-22°C)",
            "Use a sleep sack instead of blankets",
        ],
        "source": "AAP Safe Sleep Guidelines 2022",
    }


def check_developmental_milestones(age_weeks: int) -> dict:
    """
    Returns expected developmental milestones for baby's age.

    Args:
        age_weeks: Baby's age in weeks

    Returns:
        Current milestones and upcoming ones to watch for
    """
    months = age_weeks // 4

    milestones_by_month = {
        1: {
            "current": ["Moves arms/legs", "Focuses on faces", "Responds to sound"],
            "upcoming": ["Social smile (4-6 weeks)", "Holds head briefly"],
        },
        2: {
            "current": ["Social smiling", "Coos", "Follows objects with eyes"],
            "upcoming": ["Laughing (3-4 months)", "Holds head steady"],
        },
        3: {
            "current": ["Laughs and squeals", "Holds head steady", "Recognizes faces"],
            "upcoming": ["Rolling over", "Reaching for objects"],
        },
        4: {
            "current": ["Rolls from tummy to back", "Reaches for toys", "Babbles"],
            "upcoming": ["Sitting with support", "Solid foods readiness"],
        },
        6: {
            "current": ["Sits with support", "Transfers objects between hands", "Responds to name"],
            "upcoming": ["Crawling", "First words"],
        },
    }

    # Find nearest milestone data
    for m in sorted(milestones_by_month.keys(), reverse=True):
        if months >= m:
            data = milestones_by_month[m]
            return {
                "age": f"{months} months",
                "current_milestones": data["current"],
                "watch_for_next": data["upcoming"],
                "concern_note": "Every baby develops at their own pace. Discuss concerns with your pediatrician.",
            }

    return {
        "age": f"{age_weeks} weeks",
        "current_milestones": ["Reflexes: rooting, sucking, grasping", "Responds to loud sounds"],
        "watch_for_next": ["Social smile at 4-6 weeks"],
        "concern_note": "Every baby develops at their own pace.",
    }


# ─── ADK Agent Definition ─────────────────────────────────────────────────────

babyguide_agent = Agent(
    name="BabyGuide",
    model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
    description="Expert parenting assistant for first-time parents with real-time visual guidance",
    instruction="""You are BabyGuide AI — a compassionate parenting expert for first-time parents.
You have access to tools for feeding schedules, sleep guidelines, and developmental milestones.
Always ground your advice in AAP guidelines and recommend consulting a pediatrician for medical concerns.
Be warm, reassuring, and specific to the baby's actual age and situation.""",
    tools=[
        FunctionTool(get_feeding_schedule),
        FunctionTool(get_sleep_guidelines),
        FunctionTool(check_developmental_milestones),
    ],
)
