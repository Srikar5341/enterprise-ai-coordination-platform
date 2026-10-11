"""Unit tests for hosted LLM service configured with OpenRouter Nemotron 3 Ultra."""

from datetime import datetime, timezone
import json
import httpx
import pytest

from src.core.errors import AppException, ValidationError
from src.domains.ai.llm_service import LLMService


def create_mock_transport(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_openrouter_nemotron_successful_plan_generation(monkeypatch):
    """Scenario: Valid plan generated using OpenRouter base URL, Nemotron model, and no response_format."""
    service = LLMService()
    monkeypatch.setattr(service.settings, "LLM_API_KEY", "test-openrouter-key")
    monkeypatch.setattr(service.settings, "LLM_BASE_URL", "https://openrouter.ai/api/v1")
    monkeypatch.setattr(service.settings, "LLM_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free")

    sample_output = {
        "tasks": [
            {
                "temp_id": "T1",
                "title": "Database Schema Migration",
                "description": "Execute migration script",
                "estimated_hours": 2.0,
                "required_skills": ["SQL"],
            },
            {
                "temp_id": "T2",
                "title": "Deploy API Service",
                "description": "Deploy to staging cluster",
                "estimated_hours": 1.5,
                "required_skills": ["DevOps"],
            },
        ],
        "dependencies": [
            {"prerequisite_temp_id": "T1", "dependent_temp_id": "T2"}
        ],
    }

    captured_requests = []

    def mock_handler(request: httpx.Request):
        captured_requests.append(request)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps(sample_output)}}]},
        )

    client = create_mock_transport(mock_handler)
    result = service.generate_plan(
        goal_title="Release v2.4",
        goal_description="Deploy release",
        target_date=datetime.now(timezone.utc),
        custom_client=client,
    )

    # 1. Verify endpoint and headers
    assert len(captured_requests) == 1
    req = captured_requests[0]
    assert str(req.url) == "https://openrouter.ai/api/v1/chat/completions"
    assert req.headers["authorization"] == "Bearer test-openrouter-key"
    assert req.headers["http-referer"] == "http://localhost:12345"
    assert "x-title" in req.headers

    # 2. Verify payload model and absence of response_format
    req_body = json.loads(req.content.decode("utf-8"))
    assert req_body["model"] == "nvidia/nemotron-3-ultra-550b-a55b:free"
    assert "response_format" not in req_body
    assert req_body["temperature"] == 0.2

    # 3. Verify parsed and validated output
    assert len(result["tasks"]) == 2
    assert len(result["dependencies"]) == 1
    assert result["tasks"][0].temp_id == "T1"
    assert result["dependencies"][0].prerequisite_temp_id == "T1"


def test_openrouter_markdown_and_preamble_parsing(monkeypatch):
    """Scenario: Nemotron response wrapped in markdown fences with conversational preamble parses cleanly."""
    service = LLMService()
    monkeypatch.setattr(service.settings, "LLM_API_KEY", "test-key-mock")

    sample_output = {
        "tasks": [
            {
                "temp_id": "T1",
                "title": "Setup Pipeline",
                "description": "Configure CI/CD",
                "estimated_hours": 3.0,
                "required_skills": ["DevOps"],
            }
        ],
        "dependencies": [],
    }

    # Simulate realistic model response with reasoning tags and markdown fence
    raw_response_content = (
        "<think>Let me analyze the dependencies.</think>\n"
        "Here is the operational breakdown for the goal:\n"
        "```json\n"
        f"{json.dumps(sample_output, indent=2)}\n"
        "```\n"
        "I hope this helps your team plan effectively!"
    )

    def mock_handler(_request: httpx.Request):
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": raw_response_content}}]},
        )

    client = create_mock_transport(mock_handler)
    result = service.generate_plan(
        goal_title="Setup Pipeline",
        goal_description="Create pipeline",
        target_date=datetime.now(timezone.utc),
        custom_client=client,
    )

    assert len(result["tasks"]) == 1
    assert result["tasks"][0].title == "Setup Pipeline"


def test_custom_base_url_and_model_configuration(monkeypatch):
    """Scenario: Custom base URL and model settings correctly route outgoing HTTP calls."""
    service = LLMService()
    monkeypatch.setattr(service.settings, "LLM_API_KEY", "custom-key")
    monkeypatch.setattr(service.settings, "LLM_BASE_URL", "https://custom-gateway.internal/v1/")
    monkeypatch.setattr(service.settings, "LLM_MODEL", "custom/nemotron-variant")

    captured_urls = []

    def mock_handler(request: httpx.Request):
        captured_urls.append(str(request.url))
        req_body = json.loads(request.content.decode("utf-8"))
        assert req_body["model"] == "custom/nemotron-variant"
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps({"tasks": [{"temp_id": "T1", "title": "Task 1", "description": "D", "estimated_hours": 1.0}], "dependencies": []})}}]},
        )

    client = create_mock_transport(mock_handler)
    service.generate_plan(
        goal_title="Goal",
        goal_description=None,
        target_date=datetime.now(timezone.utc),
        custom_client=client,
    )

    assert len(captured_urls) == 1
    assert captured_urls[0] == "https://custom-gateway.internal/v1/chat/completions"


def test_llm_timeout_triggers_504(monkeypatch):
    """Scenario: Upstream timeout raises 504 Gateway Timeout error envelope."""
    service = LLMService()
    monkeypatch.setattr(service.settings, "LLM_API_KEY", "test-key-mock")

    def timeout_handler(_request: httpx.Request):
        raise httpx.ReadTimeout("Mocked LLM timeout")

    client = create_mock_transport(timeout_handler)
    with pytest.raises(AppException) as exc_info:
        service.generate_plan(
            goal_title="Goal",
            goal_description=None,
            target_date=datetime.now(timezone.utc),
            custom_client=client,
        )

    assert exc_info.value.status_code == 504
    assert exc_info.value.code == "LLM_TIMEOUT"


def test_llm_upstream_500_triggers_502(monkeypatch):
    """Scenario: Upstream provider HTTP failure raises 502 Bad Gateway."""
    service = LLMService()
    monkeypatch.setattr(service.settings, "LLM_API_KEY", "test-key-mock")

    def error_handler(_request: httpx.Request):
        return httpx.Response(500, text="Internal OpenRouter Crash")

    client = create_mock_transport(error_handler)
    with pytest.raises(AppException) as exc_info:
        service.generate_plan(
            goal_title="Goal",
            goal_description=None,
            target_date=datetime.now(timezone.utc),
            custom_client=client,
        )

    assert exc_info.value.status_code == 502
    assert exc_info.value.code == "LLM_PROVIDER_ERROR"


def test_llm_malformed_non_json_triggers_502(monkeypatch):
    """Scenario: Non-JSON raw text raises 502 LLM_MALFORMED_OUTPUT."""
    service = LLMService()
    monkeypatch.setattr(service.settings, "LLM_API_KEY", "test-key-mock")

    def non_json_handler(_request: httpx.Request):
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Sure, here is the plan: Step 1..."}}]},
        )

    client = create_mock_transport(non_json_handler)
    with pytest.raises(AppException) as exc_info:
        service.generate_plan(
            goal_title="Goal",
            goal_description=None,
            target_date=datetime.now(timezone.utc),
            custom_client=client,
        )

    assert exc_info.value.status_code == 502
    assert exc_info.value.code == "LLM_MALFORMED_OUTPUT"


def test_llm_cyclic_output_rejected(monkeypatch):
    """Scenario: Valid JSON with circular dependencies is rejected by deterministic validator."""
    service = LLMService()
    monkeypatch.setattr(service.settings, "LLM_API_KEY", "test-key-mock")

    cyclic_output = {
        "tasks": [
            {"temp_id": "T1", "title": "Task 1", "description": "Desc", "estimated_hours": 1.0},
            {"temp_id": "T2", "title": "Task 2", "description": "Desc", "estimated_hours": 1.0},
        ],
        "dependencies": [
            {"prerequisite_temp_id": "T1", "dependent_temp_id": "T2"},
            {"prerequisite_temp_id": "T2", "dependent_temp_id": "T1"},
        ],
    }

    def cyclic_handler(_request: httpx.Request):
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps(cyclic_output)}}]},
        )

    client = create_mock_transport(cyclic_handler)
    with pytest.raises(ValidationError) as exc_info:
        service.generate_plan(
            goal_title="Goal",
            goal_description=None,
            target_date=datetime.now(timezone.utc),
            custom_client=client,
        )

    assert exc_info.value.code == "VALIDATION_ERROR"
    assert "circular dependency" in exc_info.value.message.lower()


def test_missing_api_key_configuration(monkeypatch):
    """Scenario: Missing LLM_API_KEY raises LLM_CONFIGURATION_ERROR."""
    service = LLMService()
    monkeypatch.setattr(service.settings, "LLM_API_KEY", None)

    with pytest.raises(AppException) as exc_info:
        service.generate_plan(
            goal_title="Goal",
            goal_description=None,
            target_date=datetime.now(timezone.utc),
        )

    assert exc_info.value.status_code == 502
    assert exc_info.value.code == "LLM_CONFIGURATION_ERROR"
