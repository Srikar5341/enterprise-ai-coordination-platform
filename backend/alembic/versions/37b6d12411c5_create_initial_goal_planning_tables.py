"""create_initial_goal_planning_tables

Revision ID: 37b6d12411c5
Revises: 
Create Date: 2026-10-11 05:04:29.257503

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '37b6d12411c5'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: Create core tables for goal-to-task planning."""
    # 1. projects
    op.create_table(
        'projects',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # 2. project_members
    op.create_table(
        'project_members',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('project_id', sa.String(length=36), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False, server_default='MEMBER'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    # 3. goals
    op.create_table(
        'goals',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('project_id', sa.String(length=36), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('target_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='PENDING_PLANNING'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # 4. plan_proposals
    op.create_table(
        'plan_proposals',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('goal_id', sa.String(length=36), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('project_id', sa.String(length=36), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='GENERATED'),
        sa.Column('plan_payload', sa.JSON(), nullable=False),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reviewed_by', sa.String(length=36), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rejection_notes', sa.Text(), nullable=True),
    )

    # 5. tasks
    op.create_table(
        'tasks',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('project_id', sa.String(length=36), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('goal_id', sa.String(length=36), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('estimated_hours', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('required_skills', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='OPEN'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # 6. task_dependencies
    op.create_table(
        'task_dependencies',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('task_id', sa.String(length=36), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('prerequisite_task_id', sa.String(length=36), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema: Drop tables in reverse order."""
    op.drop_table('task_dependencies')
    op.drop_table('tasks')
    op.drop_table('plan_proposals')
    op.drop_table('goals')
    op.drop_table('project_members')
    op.drop_table('projects')
