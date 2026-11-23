"""Bound actual ASGI body bytes and public endpoint request frequency."""
import time
from collections import defaultdict, deque
from weakref import WeakSet
from starlette.responses import JSONResponse

class RequestLimits:
    instances = WeakSet()

    def __init__(self, app, max_bytes=15 * 1024 * 1024):
        self.app, self.max_bytes = app, max_bytes
        self.requests = defaultdict(deque)
        self.instances.add(self)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        public = path in {"/api/auth/register", "/api/auth/username-login", "/api/auth/password-recovery", "/api/public-inquiry", "/api/projects/geocode",
                          "/api/projects/reverse-geocode", "/api/projects/parse-boq", "/api/ai/compare-boq"}
        if public:
            now = time.monotonic()
            key = (scope.get("client", ("unknown",))[0], path)
            if len(self.requests) >= 10000:
                self.requests = defaultdict(deque, {k: v for k, v in self.requests.items() if v and v[-1] > now - 60})
            queue = self.requests[key]
            while queue and queue[0] <= now - 60:
                queue.popleft()
            limit = 5 if path in {"/api/auth/register", "/api/auth/username-login", "/api/auth/password-recovery"} else 30
            if len(queue) >= limit:
                return await JSONResponse({"detail": "Too many requests. Try again later."}, 429, headers={"Retry-After": "60"})(scope, receive, send)
            queue.append(now)
        messages, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > self.max_bytes:
                return await JSONResponse({"detail": "Request exceeds the 15 MB limit"}, 413)(scope, receive, send)
            messages.append(message)
            if not message.get("more_body", False):
                break
        async def replay():
            if messages:
                return messages.pop(0)
            return await receive()
        return await self.app(scope, replay, send)
