"""Hosted LLM prompt orchestration and structured JSON plan generation service."""

import json
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
import httpx

from src.core.config import get_settings
from src.core.errors import AppException, ValidationError
from src.domains.ai.schemas import ProposedDependency, ProposedTask
from src.domains.ai.validation import validate_plan_proposal

logger = logging.getLogger(__name__)


class LLMService:
    """Service boundary for hosted LLM generation with strict schema enforcement."""

    def __init__(self):
        self.settings = get_settings()

    def generate_plan(
        self,
        goal_title: str,
        goal_description: Optional[str],
        target_date: datetime,
        additional_instructions: Optional[str] = None,
        custom_client: Optional[httpx.Client] = None,
    ) -> Dict[str, Any]:
        """Generate structured tasks and dependency graph from operational goal context.

        Returns:
            Dict containing validated 'tasks' (List[ProposedTask]) and 'dependencies' (List[ProposedDependency]).

        Raises:
            AppException (HTTP 502/504): When provider fails, times out, or returns malformed output.
            ValidationError (HTTP 422): When generated plan fails DAG cycle or bounds checks.
        """
        prompt = self._build_prompt(
            goal_title=goal_title,
            goal_description=goal_description,
            target_date=target_date,
            additional_instructions=additional_instructions,
        )

        raw_response = self._call_provider(prompt, client=custom_client)
        parsed_data = self._parse_and_validate_json(raw_response)
        
        # Parse into Pydantic models
        try:
            tasks = [ProposedTask(**t) for t in parsed_data.get("tasks", [])]
            dependencies = [ProposedDependency(**d) for d in parsed_data.get("dependencies", [])]
        except Exception as exc:
            raise AppException(
                code="LLM_SCHEMA_ERROR",
                message=f"Hosted LLM output failed schema constraints: {exc}",
                status_code=502,
                details=str(exc),
            ) from exc

        # Deterministic DAG cycle and bounds verification
        validate_plan_proposal(tasks, dependencies)

        return {
            "tasks": tasks,
            "dependencies": dependencies,
        }

    def _build_prompt(
        self,
        goal_title: str,
        goal_description: Optional[str],
        target_date: datetime,
        additional_instructions: Optional[str] = None,
    ) -> str:
        instructions_text = f"\nAdditional Team Lead Instructions: {additional_instructions}" if additional_instructions else ""
        desc_text = f"\nDescription: {goal_description}" if goal_description else ""

        return (
            "You are an expert technical program lead and systems architect.\n"
            "Break down the following operational goal into discrete, actionable engineering tasks with temporary IDs "
            "(e.g., T1, T2, T3) and explicit dependency prerequisites.\n\n"
            f"Goal: {goal_title}{desc_text}\n"
            f"Target Timeline: {target_date.isoformat()}{instructions_text}\n\n"
            "Requirements:\n"
            "1. Output MUST be valid JSON adhering strictly to this schema:\n"
            "{\n"
            '  "tasks": [\n'
            '    {"temp_id": "T1", "title": "Task title", "description": "Scope", "estimated_hours": 3.0, "required_skills": ["Backend"]}\n'
            "  ],\n"
            '  "dependencies": [\n'
            '    {"prerequisite_temp_id": "T1", "dependent_temp_id": "T2"}\n'
            "  ]\n"
            "}\n"
            "2. Dependencies must form a strictly acyclic directed graph (DAG). No circular dependencies.\n"
            "3. Every dependency prerequisite and dependent temp_id must correspond to a task in 'tasks'.\n"
            "4. Output JSON ONLY. Do not include markdown codeblocks or conversational text."
        )

    def _call_provider(self, prompt: str, client: Optional[httpx.Client] = None) -> str:
        api_key = self.settings.LLM_API_KEY
        if not api_key:
            raise AppException(
                code="LLM_CONFIGURATION_ERROR",
                message="Hosted LLM API key is not configured (LLM_API_KEY missing in environment)",
                status_code=502,
            )

        base_url = self.settings.LLM_BASE_URL.rstrip("/")
        endpoint = f"{base_url}/chat/completions"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:12345",
            "X-Title": self.settings.PROJECT_NAME,
        }
        # Note: response_format is omitted because free Nemotron 3 Ultra endpoints reject it.
        # JSON formatting is enforced via system prompt instructions and strict server-side validation.
        payload = {
            "model": self.settings.LLM_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a software operations planning AI that returns ONLY valid JSON adhering strictly to the requested schema. No conversational preamble or markdown formatting.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }

        http_client = client or httpx.Client(timeout=90.0)
        try:
            response = http_client.post(
                endpoint,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except httpx.TimeoutException as exc:
            logger.error("Hosted LLM provider timed out: %s", exc)
            raise AppException(
                code="LLM_TIMEOUT",
                message="Hosted LLM provider timed out during plan generation",
                status_code=504,
            ) from exc
        except httpx.HTTPStatusError as exc:
            logger.error("Hosted LLM provider returned HTTP %s: %s", exc.response.status_code, exc.response.text)
            raise AppException(
                code="LLM_PROVIDER_ERROR",
                message=f"Hosted LLM provider returned error {exc.response.status_code}",
                status_code=502,
            ) from exc
        except httpx.RequestError as exc:
            logger.error("Network error communicating with hosted LLM: %s", exc)
            raise AppException(
                code="LLM_NETWORK_ERROR",
                message="Network interruption communicating with hosted LLM provider",
                status_code=502,
            ) from exc
        finally:
            if client is None:
                http_client.close()

    @staticmethod
    def _parse_and_validate_json(raw_text: str) -> Dict[str, Any]:
        text = raw_text.strip()

        # Remove model thinking/reasoning tags if present
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
        text = re.sub(r"<thought>.*?</thought>", "", text, flags=re.DOTALL)
        text = text.strip()

        # Extract JSON from markdown fence if present, or extract outer curly braces
        fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.DOTALL)
        if fence_match:
            candidate = fence_match.group(1).strip()
        else:
            first_brace = text.find("{")
            last_brace = text.rfind("}")
            if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                candidate = text[first_brace : last_brace + 1].strip()
            else:
                candidate = text

        try:
            data = json.loads(candidate)
        except json.JSONDecodeError as exc:
            raise AppException(
                code="LLM_MALFORMED_OUTPUT",
                message="Hosted LLM provider returned malformed, non-JSON output",
                status_code=502,
                details=raw_text[:200],
            ) from exc

        if not isinstance(data, dict) or "tasks" not in data:
            raise AppException(
                code="LLM_MALFORMED_OUTPUT",
                message="Generated output missing mandatory 'tasks' root object",
                status_code=502,
            )

        return data


llm_service = LLMService()
