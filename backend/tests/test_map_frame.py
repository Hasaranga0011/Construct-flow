import base64
import hashlib
import re
from fastapi.testclient import TestClient
from main import app


def test_map_frame_is_public_static_and_has_restricted_script_and_embedding_policies():
    with TestClient(app) as client:
        response = client.get('/api/maps/frame')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/html')
    assert response.headers['referrer-policy'] == 'origin'
    assert '<meta name="referrer" content="origin"' in response.text
    assert 'SUPABASE' not in response.text and 'access_token' not in response.text
    policy = response.headers['content-security-policy']
    assert "default-src 'none'" in policy
    assert "connect-src 'none'" in policy
    assert "base-uri 'none'" in policy and "form-action 'none'" in policy
    assert 'frame-ancestors ' in policy and "frame-ancestors *" not in policy
    scripts = [s for s in re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>', response.text, re.S) if s.strip()]
    assert scripts
    for script in scripts:
        digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
        assert "'sha256-" + digest + "'" in policy
    assert "script-src 'unsafe-inline'" not in policy
    assert 'var isDeferred = true' in response.text
    assert "event.source !== window.parent" in response.text


def test_map_embedding_uses_configured_frontend_origins_without_credentials(monkeypatch):
    from api.routes import maps
    from types import SimpleNamespace
    monkeypatch.setattr(maps, 'settings', SimpleNamespace(FRONTEND_URL='https://app.fixture.invalid/path', CORS_ORIGINS='http://localhost:8081,https://secret:password@bad.fixture.invalid'))
    policy = maps.map_frame().headers['content-security-policy']
    assert 'https://app.fixture.invalid' in policy
    assert 'http://localhost:8081' in policy and 'http://127.0.0.1:8081' in policy
    assert 'password' not in policy and 'bad.fixture.invalid' not in policy


def test_google_map_uses_only_browser_key_and_strict_nonce_policy(monkeypatch):
    from api.routes import maps
    monkeypatch.setattr(maps.settings, 'GOOGLE_MAPS_BROWSER_KEY', 'fixture-browser-key')
    with TestClient(app) as client:
        config = client.get('/api/maps/config')
        response = client.get('/api/maps/frame?provider=google')
    assert config.json() == {'provider': 'google'}
    assert response.status_code == 200
    assert 'fixture-browser-key' in response.text
    assert 'test-anon-key' not in response.text
    assert response.headers['cache-control'] == 'no-store'
    policy = response.headers['content-security-policy']
    assert "'strict-dynamic'" in policy and 'frame-ancestors ' in policy
    assert "script-src 'unsafe-inline'" not in policy
    nonces = set(re.findall(r'nonce="([^"]+)"', response.text))
    assert len(nonces) == 1
    assert "'nonce-" + next(iter(nonces)) + "'" in policy
    assert 'includedRegionCodes' in response.text and "['lk']" in response.text
    assert "place.fetchFields({fields:['location','formattedAddress','displayName']})" in response.text
    assert "event.source!==window.parent" in response.text
    assert '__NONCE__' not in response.text and '__GOOGLE_SCRIPT_URL__' not in response.text


def test_google_mode_never_exposes_an_old_unconfigured_key(monkeypatch):
    from api.routes import maps
    monkeypatch.setattr(maps.settings, 'GOOGLE_MAPS_BROWSER_KEY', '')
    with TestClient(app) as client:
        assert client.get('/api/maps/config').json() == {'provider': 'openstreetmap'}
        assert client.get('/api/maps/frame?provider=google').status_code == 503
