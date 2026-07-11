"""AI job holatini tekshirish (debug / monitoring)."""

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .ai_async import ai_job_status_response


class AiJobStatusView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, job_id: str):
        return ai_job_status_response(job_id, request.user.pk)
