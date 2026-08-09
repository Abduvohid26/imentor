from __future__ import annotations

from starlette.datastructures import Headers
from starlette.middleware.gzip import GZipMiddleware, GZipResponder
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Siqilmaydigan javob turlari:
#  * text/event-stream — Starlette'ning gzip oqim rejimi `flush()` qilmaydi,
#    shuning uchun deflate bufferi to'lgunicha (bir necha KB) brauzerga hech
#    narsa bormaydi va AI matnining jonli oqishi yo'qoladi.
#  * allaqachon siqilgan binar formatlar — CPU ni bekorga sarflamaslik uchun.
_SKIP_PREFIXES = ("text/event-stream", "image/", "video/", "audio/")
_SKIP_EXACT = (
    "application/pdf",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
)


def _should_skip(content_type: str) -> bool:
    ct = content_type.split(";")[0].strip().lower()
    return ct.startswith(_SKIP_PREFIXES) or ct in _SKIP_EXACT


class SmartGZipMiddleware(GZipMiddleware):
    """Javob turiga qarab tanlab siqadigan GZipMiddleware.

    JSON API javoblari (sillabus katalogi ~1.5 MB) siqiladi, SSE oqimi va
    tayyor siqilgan fayllar tegilmasdan o'tkaziladi.
    """

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or "gzip" not in Headers(scope=scope).get("Accept-Encoding", ""):
            await self.app(scope, receive, send)
            return

        responder = GZipResponder(self.app, self.minimum_size, compresslevel=self.compresslevel)
        skipped = False

        async def send_maybe_gzip(message: Message) -> None:
            nonlocal skipped
            if message["type"] == "http.response.start":
                skipped = _should_skip(Headers(raw=message["headers"]).get("content-type", ""))
            if skipped:
                await send(message)
            else:
                await responder.send_with_gzip(message)

        responder.send = send
        with responder.gzip_buffer, responder.gzip_file:
            await self.app(scope, receive, send_maybe_gzip)
