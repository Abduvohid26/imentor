from __future__ import annotations

from django import forms
from django.contrib.auth.forms import AuthenticationForm

from .phone import normalize_uz_phone_digits


class PhoneAdminLoginForm(AuthenticationForm):
    error_messages = {
        "invalid_login": "Telefon raqami yoki parol noto‘g‘ri.",
        "inactive": "Bu hisob faol emas.",
    }
    username = forms.CharField(
        label="Telefon raqami",
        widget=forms.TextInput(
            attrs={
                "autofocus": True,
                "class": "form-control",
                "placeholder": "+998 XX XXX XX XX",
                "autocomplete": "tel",
            }
        ),
    )
    password = forms.CharField(
        label="Parol",
        strip=False,
        widget=forms.PasswordInput(
            attrs={
                "class": "form-control",
                "autocomplete": "current-password",
            }
        ),
    )

    def clean_username(self):
        raw = self.cleaned_data.get("username", "")
        try:
            return normalize_uz_phone_digits(raw)
        except ValueError as exc:
            raise forms.ValidationError(str(exc)) from exc
