"""Loopback-only synthetic preview. Run with the test environment, never in production.

Supports ?test_fault=columns,media,list to exercise unavailable JS modules.
Uses only a temporary database and the real application templates/routes.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlsplit, parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from list_fixture import client_at


def main():
    with tempfile.TemporaryDirectory(prefix='teacher-list-test-') as directory:
        client, _ = client_at(directory)

        class Handler(BaseHTTPRequestHandler):
            def forward(self):
                query = parse_qs(urlsplit(self.path).query)
                if 'test_fault' in query:
                    self.server.fault = query['test_fault'][0]
                elif urlsplit(self.path).path.startswith('/admin/'):
                    self.server.fault = ''
                targets = {'columns': '/native-columns.js', 'media': '/native-media.js', 'list': '/native-list.js'}
                if urlsplit(self.path).path.endswith(targets.get(self.server.fault, '/never-match')):
                    self.send_response(503)
                    self.send_header('Content-Type', 'text/plain')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(b'Synthetic test: unavailable optional module')
                    return
                body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
                headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'cookie', 'accept-encoding', 'connection')}
                response = client.request(self.command, self.path, headers=headers, content=body, follow_redirects=False)
                self.send_response(response.status_code)
                for key, value in response.headers.items():
                    if key.lower() not in ('content-length', 'transfer-encoding', 'connection', 'content-encoding', 'set-cookie'):
                        self.send_header(key, value)
                self.send_header('Content-Length', str(len(response.content)))
                self.end_headers()
                if self.command != 'HEAD':
                    self.wfile.write(response.content)

            do_GET = do_POST = do_HEAD = forward

        server = ThreadingHTTPServer(('127.0.0.1', 8765), Handler)
        server.fault = ''
        print('Synthetic test preview: http://127.0.0.1:8765/admin/profiles', flush=True)
        try:
            server.serve_forever()
        finally:
            server.server_close()
            client.close()


if __name__ == '__main__':
    main()
