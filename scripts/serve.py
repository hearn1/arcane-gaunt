#!/usr/bin/env python3
"""ArcaneGaunt static dev server.

Serves the project root with no-cache headers (so iterating = just refresh)
and correct ES-module MIME types. No build step, no dependencies.

Usage:  python serve.py [port]      (default port 8000)
Then open http://localhost:8000
"""
import sys
import http.server

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".glb": "model/gltf-binary",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[serve] %s\n" % (fmt % args))


# ThreadingHTTPServer: the browser opens many parallel ES-module requests; a
# single-threaded server stalls on keep-alive connections and the page times out.
Handler.protocol_version = "HTTP/1.1"
with http.server.ThreadingHTTPServer(("", PORT), Handler) as httpd:
    print(f"ArcaneGaunt running:  http://localhost:{PORT}")
    print("Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[serve] stopped.")
