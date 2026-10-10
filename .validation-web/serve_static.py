from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
ROOT = Path(__file__).resolve().parent / 'static'
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == '/status':
            self.send_response(200); self.end_headers(); self.wfile.write(b'ok'); return
        candidate = ROOT
        parts = [part for part in path.split('/') if part and part not in ('.', '..')]
        for part in parts:
            exact = candidate / part
            if exact.exists(): candidate = exact
            elif exact.with_suffix('.html').is_file(): candidate = exact.with_suffix('.html')
            else:
                dynamic = next((item for item in candidate.iterdir() if item.is_dir() and item.name.startswith('[') and item.name.endswith(']')), None) if candidate.is_dir() else None
                if dynamic is None and candidate.is_dir(): dynamic = next((item for item in candidate.iterdir() if item.is_file() and item.suffix == '.html' and item.stem.startswith('[') and item.stem.endswith(']')), None)
                if dynamic is None: break
                candidate = dynamic
        if path.endswith('/') or candidate.is_dir():
            index = candidate / 'index.html'
            candidate = index if index.is_file() else candidate.with_suffix('.html')
        elif not candidate.exists(): candidate = candidate.with_suffix('.html')
        if candidate.is_file() and candidate.resolve().is_relative_to(ROOT.resolve()):
            self.path = '/' + candidate.relative_to(ROOT).as_posix()
        return super().do_GET()
ThreadingHTTPServer(('127.0.0.1', 8083), Handler).serve_forever()
