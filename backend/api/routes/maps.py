"""Public, data-free map document on the API origin, isolated from frontend storage."""
import base64
import hashlib
import re
import secrets
import html as html_module
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from core.config import settings

router = APIRouter(prefix='/maps', tags=['Maps'])
FRAME = Path(__file__).resolve().parents[2] / 'static' / 'constructflow-map.html'


@router.get('/frame', response_class=HTMLResponse)
def map_frame(provider: str = 'openstreetmap'):
    html = FRAME.read_text(encoding='utf-8')
    nonce = None
    if provider == 'google':
        key = getattr(settings, 'GOOGLE_MAPS_BROWSER_KEY', '').strip()
        if not key:
            raise HTTPException(503, 'Google Maps browser key is not configured')
        from urllib.parse import urlencode
        nonce = secrets.token_urlsafe(24)
        html = (FRAME.parent / 'constructflow-google-map.html').read_text(encoding='utf-8')
        url = 'https://maps.googleapis.com/maps/api/js?' + urlencode({'key': key, 'callback': 'initGoogleMap', 'loading': 'async', 'v': 'weekly', 'region': 'LK'})
        html = html.replace('__NONCE__', nonce).replace('__GOOGLE_SCRIPT_URL__', html_module.escape(url, quote=True))
        html = html.replace('__GOOGLE_MAP_ID__', html_module.escape(getattr(settings, 'GOOGLE_MAP_ID', '') or 'DEMO_MAP_ID', quote=True))
    hashes = ["'sha256-" + base64.b64encode(hashlib.sha256(script.encode()).digest()).decode() + "'"
              for script in re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>', html, re.S) if script.strip()]
    origins = set()
    for value in [settings.FRONTEND_URL, *settings.CORS_ORIGINS.split(',')]:
        parsed = urlsplit(value.strip())
        if parsed.scheme in {'http', 'https'} and parsed.netloc and not parsed.username and not parsed.password:
            origins.add(parsed.scheme + '://' + parsed.netloc)
            if parsed.hostname in {'localhost', '127.0.0.1'}:
                alternate = '127.0.0.1' if parsed.hostname == 'localhost' else 'localhost'
                origins.add(parsed.scheme + '://' + alternate + (':' + str(parsed.port) if parsed.port else ''))
    ancestors = ' '.join(sorted(origins)) or "'none'"
    csp = ("default-src 'none'; script-src https://unpkg.com " + ' '.join(hashes) +
           "; style-src https://unpkg.com 'unsafe-inline'; img-src data: https://tile.openstreetmap.org https://server.arcgisonline.com; "
           "connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors " + ancestors)
    if nonce:
        csp = (f"default-src 'none'; script-src 'nonce-{nonce}' 'strict-dynamic' https: 'unsafe-eval' blob:; "
               "img-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com data:; "
               "frame-src https://*.google.com; connect-src 'self' https://*.googleapis.com https://*.google.com https://*.gstatic.com data: blob:; "
               f"font-src https://fonts.gstatic.com; style-src 'nonce-{nonce}' https://fonts.googleapis.com; worker-src blob:; "
               "base-uri 'none'; form-action 'none'; frame-ancestors " + ancestors)
    return HTMLResponse(html, headers={'Referrer-Policy': 'origin', 'Content-Security-Policy': csp,
        'Cache-Control': 'no-store' if nonce else 'public, max-age=300', 'X-Content-Type-Options': 'nosniff'})


@router.get('/config')
def map_configuration():
    if getattr(settings, 'GEOAPIFY_API_KEY', '').strip():
        return {'provider': 'openstreetmap', 'search_provider': 'geoapify'}
    return {'provider': 'google' if getattr(settings, 'GOOGLE_MAPS_BROWSER_KEY', '').strip() else 'openstreetmap'}
