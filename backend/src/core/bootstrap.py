"""Repeatable development bootstrap utility for demo users, projects, and memberships.

Idempotently provisions demonstration resources without hardcoding credentials in production
or exposing secrets in version control.
"""

import os
import sys
from typing import Any, Dict, Optional
import logging
from sqlalchemy.orm import Session

from src.core.database import SessionLocal
from src.core.security import hash_password
from src.domains.auth.models import User
from src.domains.projects.models import Project, ProjectMember

logger = logging.getLogger(__name__)


def bootstrap_demo_environment(db: Optional[Session] = None) -> Dict[str, Any]:
    """Idempotently bootstrap demo user, sample project, and LEAD membership in MySQL.

    Uses environment configuration (or development fallbacks) without mutating existing data.
    """
    demo_email = os.getenv("DEMO_USER_EMAIL", "lead@revora.local").strip().lower()
    demo_password = os.getenv("DEMO_USER_PASSWORD", "DemoLead123!").strip()
    demo_name = os.getenv("DEMO_USER_NAME", "Revora Demo Lead").strip()
    demo_project_name = os.getenv("DEMO_PROJECT_NAME", "Revora Core Infrastructure").strip()
    demo_project_desc = os.getenv(
        "DEMO_PROJECT_DESC", "Core platform coordination project for hackathon demonstration"
    ).strip()

    close_session_on_exit = False
    if db is None:
        db = SessionLocal()
        close_session_on_exit = True

    try:
        # 1. Provision Demo User
        user = db.query(User).filter(User.email == demo_email).first()
        user_created = False
        if not user:
            user = User(
                email=demo_email,
                full_name=demo_name,
                hashed_password=hash_password(demo_password),
                role="LEAD",
                is_active=True,
                is_verified=True,  # Pre-verified for development demo workflows
                verification_token=None,
            )
            db.add(user)
            db.flush()
            user_created = True
            logger.info("Created demo user: %s (id: %s)", demo_email, user.id)
        else:
            # Ensure demo user has active and lead attributes
            user.is_active = True
            user.is_verified = True
            if user.role != "ADMIN":
                user.role = "LEAD"
            logger.info("Found existing demo user: %s (id: %s)", demo_email, user.id)

        # 2. Provision Demo Project
        project = db.query(Project).filter(Project.name == demo_project_name).first()
        project_created = False
        if not project:
            project = Project(
                name=demo_project_name,
                description=demo_project_desc,
            )
            db.add(project)
            db.flush()
            project_created = True
            logger.info("Created demo project: %s (id: %s)", demo_project_name, project.id)
        else:
            logger.info("Found existing demo project: %s (id: %s)", demo_project_name, project.id)

        # 3. Provision Project Membership
        membership = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == user.id,
            )
            .first()
        )
        membership_created = False
        if not membership:
            membership = ProjectMember(
                project_id=project.id,
                user_id=user.id,
                role="LEAD",
            )
            db.add(membership)
            db.flush()
            membership_created = True
            logger.info("Assigned user %s as LEAD on project %s", user.id, project.id)
        else:
            if membership.role != "LEAD":
                membership.role = "LEAD"
                logger.info("Updated user %s membership to LEAD on project %s", user.id, project.id)

        db.commit()

        summary = {
            "user_id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "user_created": user_created,
            "project_id": project.id,
            "project_name": project.name,
            "project_created": project_created,
            "membership_id": membership.id,
            "membership_role": membership.role,
            "membership_created": membership_created,
        }
        return summary

    finally:
        if close_session_on_exit:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Executing Revora development bootstrap...")
    result = bootstrap_demo_environment()
    print("Bootstrap completed successfully:")
    for key, val in result.items():
        print(f"  {key}: {val}")
