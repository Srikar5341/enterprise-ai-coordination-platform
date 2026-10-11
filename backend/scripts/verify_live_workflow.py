"""Live workflow verification script for Revora authentication and AI goal planning.

Verifies end-to-end workflows against the live MySQL 8 database:
1. Bootstrapped credential login (POST /api/v1/auth/login)
2. Authenticated user profile retrieval (GET /api/v1/auth/me)
3. Goal creation (POST /api/v1/projects/{project_id}/goals)
4. AI Plan proposal generation (POST /api/v1/ai/plan/generate)
5. Staged proposal retrieval (GET /api/v1/ai/plan-proposals/{proposal_id})
6. Human approval and atomic database persistence (POST /api/v1/ai/plan-proposals/{proposal_id}/approve)
7. Scoped database verification (counting tasks and dependencies belonging strictly to the current goal)
8. Duplicate approval conflict rejection (HTTP 409)
9. Refresh token rotation and logout revocation
10. Registration audit (unverified account creation and unconfigured email delivery)
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta, timezone

# Ensure backend root is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from sqlalchemy import text
from src.main import app
from src.core.database import SessionLocal, engine
from src.core.bootstrap import bootstrap_demo_environment

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("workflow-verification")


def run_workflow_verification():
    logger.info("=================================================================")
    logger.info("Starting Revora Live Workflow Verification")
    logger.info("=================================================================")

    # Use mocked LLM by default to conserve OpenRouter quota unless --live-llm is specified
    if "--live-llm" not in sys.argv:
        logger.info("Mock LLM mode active (preserving OpenRouter quota). Pass --live-llm for live model.")
        sample_plan = {
            "tasks": [
                {"temp_id": "T1", "title": "Infrastructure Setup", "description": "Setup test environment", "estimated_hours": 4.0},
                {"temp_id": "T2", "title": "Database Schema Validation", "description": "Validate relational tables", "estimated_hours": 3.0},
                {"temp_id": "T3", "title": "Integration State Verification", "description": "Confirm persisted records", "estimated_hours": 2.0},
            ],
            "dependencies": [
                {"prerequisite_temp_id": "T1", "dependent_temp_id": "T2"},
                {"prerequisite_temp_id": "T2", "dependent_temp_id": "T3"},
            ],
        }
        from src.domains.ai.llm_service import llm_service
        llm_service._call_provider = lambda prompt, client=None: json.dumps(sample_plan)
    else:
        logger.info("LIVE LLM mode active: requests will be sent to configured hosted provider.")

    # 1. Ensure Bootstrap State in MySQL
    logger.info("[Step 1] Bootstrapping demo environment in live MySQL 8...")
    bootstrap_info = bootstrap_demo_environment()
    demo_email = bootstrap_info["email"]
    demo_password = os.getenv("DEMO_USER_PASSWORD", "DemoLead123!")
    project_id = bootstrap_info["project_id"]
    logger.info("Demo user: %s, Project ID: %s", demo_email, project_id)

    client = TestClient(app)

    # 2. Login
    logger.info("[Step 2] Testing authentication login with bootstrapped credentials...")
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": demo_email, "password": demo_password},
    )
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    tokens = login_res.json()
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]
    logger.info("Login successful. Access token obtained (expires in %ds).", tokens["expires_in"])

    headers = {"Authorization": f"Bearer {access_token}"}

    # 3. User Profile
    logger.info("[Step 3] Testing /auth/me user profile retrieval...")
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200, f"Failed /auth/me: {me_res.text}"
    profile = me_res.json()
    logger.info("Profile verified: %s <%s>, Role: %s, Verified: %s", profile["full_name"], profile["email"], profile["role"], profile["is_verified"])

    # 4. Create Goal
    logger.info("[Step 4] Creating isolated operational goal for project %s...", project_id)
    target_date = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    goal_res = client.post(
        f"/api/v1/projects/{project_id}/goals",
        headers=headers,
        json={
            "title": f"Live Verification Goal {datetime.now(timezone.utc).strftime('%H:%M:%S')}",
            "description": "Verification of scoped task and dependency persistence.",
            "target_date": target_date,
        },
    )
    assert goal_res.status_code == 201, f"Failed goal creation: {goal_res.text}"
    goal = goal_res.json()
    goal_id = goal["id"]
    logger.info("Goal created successfully: %s (Status: %s)", goal_id, goal["status"])

    # 5. Generate AI Plan Proposal
    logger.info("[Step 5] Generating plan proposal...")
    gen_res = client.post(
        "/api/v1/ai/plan/generate",
        headers=headers,
        json={
            "goal_id": goal_id,
            "additional_instructions": "Ensure strict acyclic graph dependencies.",
        },
    )
    assert gen_res.status_code == 201, f"Plan generation failed: {gen_res.text}"
    gen_data = gen_res.json()
    proposal_id = gen_data["proposal_id"]
    staged_tasks = gen_data["tasks"]
    staged_deps = gen_data["dependencies"]
    logger.info(
        "Proposal generated: %s (Status: %s). Tasks proposed: %d, Dependencies proposed: %d",
        proposal_id,
        gen_data["status"],
        len(staged_tasks),
        len(staged_deps),
    )

    # 6. Verify Staged Isolation (zero rows written to tasks or task_dependencies)
    with engine.connect() as conn:
        staged_task_count = conn.execute(
            text("SELECT count(*) FROM tasks WHERE goal_id = :gid"),
            {"gid": goal_id},
        ).scalar()
        assert staged_task_count == 0, f"Staging violation: {staged_task_count} tasks exist before approval"
    logger.info("Staging isolation verified: 0 tasks written to tasks table prior to approval.")

    # 7. Retrieve Proposal
    logger.info("[Step 7] Retrieving staged proposal...")
    get_prop_res = client.get(f"/api/v1/ai/plan-proposals/{proposal_id}", headers=headers)
    assert get_prop_res.status_code == 200, f"Failed proposal retrieval: {get_prop_res.text}"
    assert get_prop_res.json()["proposal_id"] == proposal_id

    # 8. Approve Proposal
    logger.info("[Step 8] Approving proposal %s...", proposal_id)
    approve_res = client.post(f"/api/v1/ai/plan-proposals/{proposal_id}/approve", headers=headers)
    assert approve_res.status_code == 200, f"Approval failed: {approve_res.text}"
    app_data = approve_res.json()
    expected_tasks_count = app_data["created_tasks_count"]
    expected_deps_count = app_data["created_dependencies_count"]
    logger.info(
        "Approval response: Status=%s, created_tasks_count=%d, created_dependencies_count=%d",
        app_data["status"],
        expected_tasks_count,
        expected_deps_count,
    )

    # 9. Scoped Database Verification
    logger.info("[Step 9] Performing scoped database verification against MySQL...")
    with engine.connect() as conn:
        # A. Query tasks belonging strictly to current goal
        actual_tasks_count = conn.execute(
            text("SELECT count(*) FROM tasks WHERE goal_id = :gid"),
            {"gid": goal_id},
        ).scalar()

        # B. Query dependencies belonging strictly to current goal's tasks
        actual_deps_count = conn.execute(
            text("""
                SELECT count(td.id)
                FROM task_dependencies td
                JOIN tasks t ON td.task_id = t.id
                WHERE t.goal_id = :gid
            """),
            {"gid": goal_id},
        ).scalar()

        # C. Query total rows across entire tables (for comparison/demonstration)
        total_tasks_in_db = conn.execute(text("SELECT count(*) FROM tasks")).scalar()
        total_deps_in_db = conn.execute(text("SELECT count(*) FROM task_dependencies")).scalar()

    logger.info("-----------------------------------------------------------------")
    logger.info("DATABASE VERIFICATION METRICS:")
    logger.info("  Current Goal ID:                   %s", goal_id)
    logger.info("  Approval response tasks:           %d", expected_tasks_count)
    logger.info("  MySQL tasks for current goal:      %d", actual_tasks_count)
    logger.info("  Approval response dependencies:    %d", expected_deps_count)
    logger.info("  MySQL dependencies for this goal:  %d", actual_deps_count)
    logger.info("  --- Comparison with global counts ---")
    logger.info("  Global tasks in entire table:      %d (includes prior goals)", total_tasks_in_db)
    logger.info("  Global dependencies in table:      %d (includes prior goals)", total_deps_in_db)
    logger.info("-----------------------------------------------------------------")

    # Assert exact match for scoped counts
    assert actual_tasks_count == expected_tasks_count, (
        f"Task count mismatch: expected {expected_tasks_count}, found {actual_tasks_count}"
    )
    assert actual_deps_count == expected_deps_count, (
        f"Dependency count mismatch: expected {expected_deps_count}, found {actual_deps_count}"
    )
    logger.info("SUCCESS: Scoped dependency count EXACTLY matches the approval response!")

    # 10. Duplicate Approval Guard
    logger.info("[Step 10] Testing duplicate approval guard (HTTP 409 Conflict)...")
    dup_res = client.post(f"/api/v1/ai/plan-proposals/{proposal_id}/approve", headers=headers)
    assert dup_res.status_code == 409, f"Duplicate approval expected 409, got {dup_res.status_code}"
    assert dup_res.json()["error"]["code"] == "CONFLICT"
    logger.info("Duplicate approval guard verified (HTTP 409 Conflict returned).")

    # 11. Refresh Token Rotation
    logger.info("[Step 11] Testing refresh token rotation...")
    rot_res = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert rot_res.status_code == 200, f"Token rotation failed: {rot_res.text}"
    new_tokens = rot_res.json()
    new_refresh_token = new_tokens["refresh_token"]
    assert new_refresh_token != refresh_token, "Refresh token was not rotated"

    # Replay old refresh token -> must fail
    replay_res = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert replay_res.status_code == 401, f"Expected 401 on replay, got {replay_res.status_code}"
    logger.info("Token rotation and replay rejection verified.")

    # 12. Logout Revocation
    logger.info("[Step 12] Testing logout revocation...")
    logout_res = client.post("/api/v1/auth/logout", json={"refresh_token": new_refresh_token})
    assert logout_res.status_code == 200, f"Logout failed: {logout_res.text}"
    after_logout_res = client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh_token})
    assert after_logout_res.status_code == 401, f"Expected 401 after logout, got {after_logout_res.status_code}"
    logger.info("Logout revocation verified.")

    # 13. Registration and Email Verification Lifecycle
    logger.info("[Step 13] Verifying user registration and complete email verification lifecycle...")
    from src.domains.auth.email_delivery import DevInMemoryEmailSink, set_email_provider
    sink = DevInMemoryEmailSink()
    set_email_provider(sink)

    test_email = f"audit_{datetime.now(timezone.utc).strftime('%H%M%S')}@revora.local"
    test_password = "Password123!"
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": test_email,
            "password": test_password,
            "full_name": "Audit Test User",
        },
    )
    assert reg_res.status_code == 201, f"Registration failed: {reg_res.text}"
    reg_data = reg_res.json()
    assert reg_data["user"]["is_verified"] is False, "New account must be unverified"
    assert reg_data["verification_status"] == "pending_verification"
    assert "token" not in reg_data, "Token must never be exposed in response body"

    # Capture token from sink
    raw_verify_token = sink.get_latest_token(test_email)
    assert raw_verify_token is not None, "Delivery sink must capture raw token"

    # Verify unverified login is blocked
    blocked_login = client.post(
        "/api/v1/auth/login",
        json={"email": test_email, "password": test_password},
    )
    assert blocked_login.status_code == 403, f"Expected 403 for unverified user, got {blocked_login.status_code}"
    assert blocked_login.json()["error"]["code"] == "FORBIDDEN"
    logger.info("Unverified login rejection verified (HTTP 403 Forbidden).")

    # Verify resend rate limit (cooldown)
    cooldown_res = client.post("/api/v1/auth/resend-verification", json={"email": test_email})
    assert cooldown_res.status_code == 429, f"Expected 429 for immediate resend, got {cooldown_res.status_code}"
    assert cooldown_res.json()["error"]["code"] == "RATE_LIMIT_EXCEEDED"
    logger.info("Resend rate-limiting cooldown verified (HTTP 429 RateLimitError).")

    # Verify email via endpoint
    verify_res = client.post("/api/v1/auth/verify-email", json={"token": raw_verify_token})
    assert verify_res.status_code == 200, f"Email verification failed: {verify_res.text}"
    assert verify_res.json()["user"]["is_verified"] is True
    logger.info("Email verification endpoint verified (HTTP 200 OK, account verified).")

    # Verify replay rejection
    replay_verify = client.post("/api/v1/auth/verify-email", json={"token": raw_verify_token})
    assert replay_verify.status_code == 409, f"Expected 409 on token replay, got {replay_verify.status_code}"
    assert replay_verify.json()["error"]["code"] == "CONFLICT"
    logger.info("Token replay rejection verified (HTTP 409 Conflict).")

    # Verify login now succeeds
    success_login = client.post(
        "/api/v1/auth/login",
        json={"email": test_email, "password": test_password},
    )
    assert success_login.status_code == 200, f"Login failed after verification: {success_login.text}"
    assert "access_token" in success_login.json()
    logger.info("Verified user login verified (HTTP 200 OK, tokens issued).")

    # Inspect MySQL state directly
    with engine.connect() as conn:
        user_row = conn.execute(
            text("SELECT is_verified, verification_token_consumed_at, verification_token FROM users WHERE email = :em"),
            {"em": test_email},
        ).fetchone()
        assert user_row[0] == 1, "User must be is_verified = 1 in MySQL"
        assert user_row[1] is not None, "Consumed timestamp must be recorded in MySQL"
        assert user_row[2] is None, "Legacy plaintext token must be None in MySQL"
    logger.info("MySQL state inspection confirmed: is_verified=1, consumed_at recorded, zero raw token stored.")

    logger.info("=================================================================")
    logger.info("ALL LIVE WORKFLOW VERIFICATIONS PASSED SUCCESSFULLY!")
    logger.info("=================================================================")


if __name__ == "__main__":
    run_workflow_verification()

