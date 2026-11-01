"""Lokale webserver voor de Chemie Escape Room."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os, webbrowser

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
URL = 'http://127.0.0.1:8000'
print('Chemie Escape Room draait op', URL)
print('Laat dit venster open tijdens het spelen. Stoppen kan met Ctrl+C.')
try:
    webbrowser.open(URL)
except Exception:
    pass
ThreadingHTTPServer(('127.0.0.1', 8000), SimpleHTTPRequestHandler).serve_forever()
