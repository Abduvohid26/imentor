from __future__ import annotations

from pydantic import BaseModel


class OnlineTestStudentLoginRequest(BaseModel):
    id: str = ""
    student_id: str = ""
    username: str = ""
    password: str = ""
