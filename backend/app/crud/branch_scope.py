"""
Branch scoping helper (app/crud/branch_scope.py, where your router imports it from).

Rule: a SUPER_ADMIN may work with any branch (or all of them). Everyone else is
limited to the branch_id stored on their own user row, whatever the client sends.

require_super_admin is NOT defined here: it already exists in app/core/dependencies.py.
"""
import uuid
from typing import Optional

from app.core.exceptions import ForbiddenError
from app.models.users import UserModel
from app.schemas.users import UserRole


def resolve_branch_scope(actor: UserModel, requested: Optional[uuid.UUID]) -> Optional[uuid.UUID]:
    """
    Return the branch a request must be limited to (None = all branches, super admin only).
    Raises 403 if a non-super-admin asks for a branch that is not theirs.
    """
    if actor.role == UserRole.SUPER_ADMIN:
        return requested
    if actor.branch_id is None:
        raise ForbiddenError("Your account is not assigned to a branch", code="no_branch")
    if requested is not None and requested != actor.branch_id:
        raise ForbiddenError("You can only access your own branch", code="wrong_branch")
    return actor.branch_id  # always the user's own branch, never trust the client