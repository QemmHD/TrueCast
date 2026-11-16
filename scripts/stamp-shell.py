"""Give every changed Pages artifact a distinct, coherent service-worker cache."""
import hashlib
import re
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else '_site')
digest = hashlib.sha256()
for asset in sorted(root.rglob('*')):
    if asset.is_file() and asset != root / 'sw.js':
        digest.update(asset.relative_to(root).as_posix().encode())
        digest.update(b'\0')
        digest.update(asset.read_bytes())
        digest.update(b'\0')
worker = root / 'sw.js'
source = worker.read_text()
version = f'truecast-shell-v4-{digest.hexdigest()[:12]}'
updated, count = re.subn(r'const CACHE = "truecast-shell-v4(?:-[a-f0-9]{12})?";', f'const CACHE = "{version}";', source, count=1)
if count != 1:
    raise SystemExit('Could not identify the service-worker cache version')
worker.write_text(updated)
print(version)
