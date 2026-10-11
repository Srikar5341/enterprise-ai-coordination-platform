"""Deterministic DAG and Plan Validation Service using Kahn's algorithm."""

from collections import defaultdict, deque
from typing import Dict, List, Set, Union

from src.core.errors import ValidationError
from src.domains.ai.schemas import ProposedDependency, ProposedTask


def validate_plan_proposal(
    tasks: List[Union[ProposedTask, Dict]],
    dependencies: List[Union[ProposedDependency, Dict]],
) -> None:
    """Deterministically validates plan tasks, references, positive duration bounds, and DAG acyclicity.

    Raises:
        ValidationError: If any duration is invalid, temp_id duplicated, dependency reference missing, or cycle detected.
    """
    if not tasks:
        raise ValidationError(message="Plan proposal must contain at least one task")

    task_temp_ids: Set[str] = set()

    # 1. Validate task attributes, bounds, and uniqueness
    for t in tasks:
        temp_id = t.temp_id if isinstance(t, ProposedTask) else t.get("temp_id")
        title = t.title if isinstance(t, ProposedTask) else t.get("title", "")
        hours = t.estimated_hours if isinstance(t, ProposedTask) else t.get("estimated_hours", 0.0)

        if not temp_id or not str(temp_id).strip():
            raise ValidationError(message="Task temp_id must be a non-empty string")

        temp_id_str = str(temp_id).strip()
        if temp_id_str in task_temp_ids:
            raise ValidationError(
                message=f"Duplicate task temporary ID detected: '{temp_id_str}'",
                details={"temp_id": temp_id_str},
            )
        task_temp_ids.add(temp_id_str)

        if not title or len(str(title).strip()) < 3:
            raise ValidationError(
                message=f"Task '{temp_id_str}' title must contain at least 3 characters",
                details={"temp_id": temp_id_str},
            )

        try:
            hours_val = float(hours)
            if hours_val <= 0.0 or hours_val > 1000.0:
                raise ValueError()
        except (ValueError, TypeError) as exc:
            raise ValidationError(
                message=f"Task '{temp_id_str}' estimated_hours must be between 0.1 and 1000.0 hours",
                details={"temp_id": temp_id_str, "estimated_hours": hours},
            ) from exc

    # 2. Validate dependency references
    in_degree: Dict[str, int] = {tid: 0 for tid in task_temp_ids}
    adj_list: Dict[str, List[str]] = defaultdict(list)

    for dep in dependencies:
        prereq = dep.prerequisite_temp_id if isinstance(dep, ProposedDependency) else dep.get("prerequisite_temp_id")
        dependent = dep.dependent_temp_id if isinstance(dep, ProposedDependency) else dep.get("dependent_temp_id")

        prereq_str = str(prereq).strip() if prereq else ""
        dependent_str = str(dependent).strip() if dependent else ""

        if not prereq_str or prereq_str not in task_temp_ids:
            raise ValidationError(
                message=f"Dependency references non-existent prerequisite task: '{prereq_str}'",
                details={"prerequisite_temp_id": prereq_str},
            )

        if not dependent_str or dependent_str not in task_temp_ids:
            raise ValidationError(
                message=f"Dependency references non-existent dependent task: '{dependent_str}'",
                details={"dependent_temp_id": dependent_str},
            )

        if prereq_str == dependent_str:
            raise ValidationError(
                message=f"Self-referencing circular dependency on task '{prereq_str}'",
                details={"cycle": [prereq_str, dependent_str]},
            )

        adj_list[prereq_str].append(dependent_str)
        in_degree[dependent_str] += 1

    # 3. Kahn's Algorithm for Topological Sort & Cycle Detection
    queue: deque = deque([tid for tid, deg in in_degree.items() if deg == 0])
    visited_count = 0

    while queue:
        curr = queue.popleft()
        visited_count += 1

        for neighbor in adj_list[curr]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if visited_count != len(task_temp_ids):
        # Remaining nodes with in_degree > 0 form the cycle
        cyclic_nodes = [tid for tid, deg in in_degree.items() if deg > 0]
        raise ValidationError(
            message="Circular dependency cycle detected in plan proposal",
            details={"cyclic_tasks": cyclic_nodes},
        )
