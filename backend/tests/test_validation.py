"""Unit tests for deterministic plan and DAG cycle validation."""

import pytest
from src.core.errors import ValidationError
from src.domains.ai.schemas import ProposedDependency, ProposedTask
from src.domains.ai.validation import validate_plan_proposal


def test_valid_acyclic_proposal():
    """Scenario: Valid linear and branching dependency graph passes validation."""
    tasks = [
        ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0),
        ProposedTask(temp_id="T2", title="Task 2", description="Desc 2", estimated_hours=3.5),
        ProposedTask(temp_id="T3", title="Task 3", description="Desc 3", estimated_hours=1.0),
    ]
    # T1 -> T2 and T1 -> T3
    dependencies = [
        ProposedDependency(prerequisite_temp_id="T1", dependent_temp_id="T2"),
        ProposedDependency(prerequisite_temp_id="T1", dependent_temp_id="T3"),
    ]

    # Should succeed without raising
    validate_plan_proposal(tasks, dependencies)


def test_cyclic_dependency_2_nodes():
    """Scenario: Circular dependency between 2 tasks is detected by Kahn's algorithm."""
    tasks = [
        ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0),
        ProposedTask(temp_id="T2", title="Task 2", description="Desc 2", estimated_hours=3.0),
    ]
    # T1 -> T2 and T2 -> T1
    dependencies = [
        ProposedDependency(prerequisite_temp_id="T1", dependent_temp_id="T2"),
        ProposedDependency(prerequisite_temp_id="T2", dependent_temp_id="T1"),
    ]

    with pytest.raises(ValidationError) as exc:
        validate_plan_proposal(tasks, dependencies)
    assert "circular dependency" in exc.value.message.lower()


def test_cyclic_dependency_3_nodes():
    """Scenario: Circular dependency in 3-task cycle (T1 -> T2 -> T3 -> T1) is rejected."""
    tasks = [
        ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=1.0),
        ProposedTask(temp_id="T2", title="Task 2", description="Desc 2", estimated_hours=1.0),
        ProposedTask(temp_id="T3", title="Task 3", description="Desc 3", estimated_hours=1.0),
    ]
    dependencies = [
        ProposedDependency(prerequisite_temp_id="T1", dependent_temp_id="T2"),
        ProposedDependency(prerequisite_temp_id="T2", dependent_temp_id="T3"),
        ProposedDependency(prerequisite_temp_id="T3", dependent_temp_id="T1"),
    ]

    with pytest.raises(ValidationError) as exc:
        validate_plan_proposal(tasks, dependencies)
    assert "circular dependency" in exc.value.message.lower()


def test_self_referencing_dependency():
    """Scenario: Task depending on itself is detected immediately."""
    tasks = [
        ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0),
    ]
    dependencies = [
        ProposedDependency(prerequisite_temp_id="T1", dependent_temp_id="T1"),
    ]

    with pytest.raises(ValidationError) as exc:
        validate_plan_proposal(tasks, dependencies)
    assert "self-referencing" in exc.value.message.lower()


def test_missing_dependency_reference():
    """Scenario: Dependency referencing non-existent task is rejected."""
    tasks = [
        ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0),
    ]
    dependencies = [
        ProposedDependency(prerequisite_temp_id="T1", dependent_temp_id="T99"),
    ]

    with pytest.raises(ValidationError) as exc:
        validate_plan_proposal(tasks, dependencies)
    assert "non-existent" in exc.value.message.lower()


def test_duplicate_task_temp_id():
    """Scenario: Proposal with duplicated temp_ids is rejected."""
    tasks = [
        ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0),
        ProposedTask(temp_id="T1", title="Duplicate Task 1", description="Desc 2", estimated_hours=3.0),
    ]

    with pytest.raises(ValidationError) as exc:
        validate_plan_proposal(tasks, [])
    assert "duplicate" in exc.value.message.lower()


def test_invalid_estimated_hours():
    """Scenario: Zero or negative hours is rejected by schema and validator."""
    with pytest.raises(Exception):
        ProposedTask(temp_id="T1", title="Task 1", description="Desc", estimated_hours=0.0)
