#!/usr/bin/env bash
# ONLYOFFICE spike checks (ADR-0143 «План проверки»): fidelity + cost against a local Document
# Server. Needs Docker and ≥ 8 GB free (the image is ~4 GB unpacked). Local only: ports 18080
# (Document Server) and 18090 (harness); never the stand or the cluster.
#
#   tools/office-fidelity/run.sh [OUT_DIR]        # default /tmp/calab-office
#   KEEP=1 tools/office-fidelity/run.sh           # keep the container and the image
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${1:-/tmp/calab-office}
IMAGE=${IMAGE:-onlyoffice/documentserver:10.0.0}
NAME=calab-ds-spike
mkdir -p "$OUT"

free_gb=$(df -g "$OUT" | awk 'NR==2 {print $4}')
if [ "${free_gb:-0}" -lt 8 ]; then echo "only ${free_gb} GB free, need 8" >&2; exit 1; fi

# The JWT secret lives only in OUT/ds.env (outside the repository).
if [ ! -f "$OUT/ds.env" ]; then echo "JWT_SECRET=$(openssl rand -hex 32)" > "$OUT/ds.env"; chmod 600 "$OUT/ds.env"; fi

cleanup() {
  if [ "${KEEP:-0}" != 1 ]; then
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker image rm "$IMAGE" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p 127.0.0.1:18080:80 \
  --env-file "$OUT/ds.env" -e JWT_ENABLED=true -e JWT_HEADER=Authorization -e JWT_IN_BODY=false \
  -e ALLOW_PRIVATE_IP_ADDRESS=true -e PLUGINS_ENABLED=false \
  --add-host host.docker.internal:host-gateway \
  -v "$ROOT/infra/office:/var/www/onlyoffice/documentserver/web-apps/apps/calab:ro" \
  "$IMAGE" >/dev/null
echo "waiting for the Document Server…"
until [ "$(curl -fsS http://localhost:18080/healthcheck 2>/dev/null)" = "true" ]; do sleep 3; done
docker stats --no-stream --format '{{.Name}} idle: {{.MemUsage}} cpu {{.CPUPerc}}' "$NAME" | tee "$OUT/ds-idle.txt"

VENV=${VENV:-/tmp/calab-office-venv}
[ -x "$VENV/bin/python" ] || { python3 -m venv "$VENV" && "$VENV/bin/pip" install -q openpyxl python-docx python-pptx; }
"$VENV/bin/python" -I "$ROOT/tools/office-fidelity/fixtures.py" "$OUT"

# Container memory with one open document: sampled while the bench idles in the editor.
( sleep 60; docker stats --no-stream --format '{{.Name}} one document open: {{.MemUsage}} cpu {{.CPUPerc}}' "$NAME" | tee "$OUT/ds-open.txt" ) &
node "$ROOT/tools/office-fidelity/bench.mjs" --ds http://localhost:18080 --secret-file "$OUT/ds.env" --fixtures "$OUT" --out "$OUT"
wait

for f in vacations.xlsx contract.docx deck.pptx staff.csv; do
  for kind in convert editor6 editor2 legacy; do
    [ -f "$OUT/$kind-$f" ] && "$VENV/bin/python" -I "$ROOT/tools/office-fidelity/compare.py" "$OUT/$f" "$OUT/$kind-$f" | sed "s/^/[$kind] /" || true
  done
done
du -sh "$OUT"/editor-*.png 2>/dev/null || true
echo "report: $OUT/bench.json, screenshots: $OUT/editor-*.png"
