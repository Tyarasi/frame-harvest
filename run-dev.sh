#!/usr/bin/env bash
# Jalankan backend (FastAPI/uvicorn, :8000) dan frontend (Vite dev server, :5173)
# sekaligus. Ctrl+C menghentikan keduanya bersih.

set -euo pipefail
cd "$(dirname "$0")"

# Kill proses uvicorn lama (kalau ada) dan TUNGGU sampai benar-benar mati,
# baru lanjut. Ini bukan cuma jaga-jaga kosmetik: kamera RTSP di backend
# baca frame lewat panggilan blocking (cv2.VideoCapture.read()) dengan
# timeout ~30 detik — kalau lagi macet nunggu 1 frame pas SIGTERM dikirim,
# prosesnya BISA TIDAK LANGSUNG MATI walau sudah di-pkill. Kalau baris
# berikutnya langsung start instance baru tanpa menunggu itu, dua proses
# uvicorn sempat nyala bersamaan rebutan port 8000 — yang kalah rebutan
# jadi "proses hantu": kehilangan port (tidak bisa diakses via HTTP/UI sama
# sekali) TAPI thread kamera-nya sendiri tetap jalan di background,
# terus-menerus nyoba baca RTSP dan mencatat log timeout, sampai dibunuh
# manual. Sudah kejadian 2x sebelum akhirnya loop tunggu ini ditambahkan.
kill_and_wait() {
  local pattern="$1"
  local max_wait_sec="${2:-10}"
  pkill -f "$pattern" 2>/dev/null || true
  local waited=0
  while pgrep -f "$pattern" >/dev/null 2>&1; do
    if [ "$waited" -ge "$max_wait_sec" ]; then
      echo "  ($pattern belum mati setelah ${max_wait_sec}s, paksa kill -9)"
      pkill -9 -f "$pattern" 2>/dev/null || true
      sleep 0.5
      break
    fi
    sleep 0.5
    waited=$((waited + 1))
  done
}

kill_and_wait "backend/venv/bin/uvicorn app:app"
kill_and_wait "frontend/node_modules/.bin/vite"

(
  cd backend
  source venv/bin/activate
  uvicorn app:app --host 0.0.0.0 --port 8000
) &

# Tunggu backend beneran siap nerima request sebelum start frontend. Backend
# butuh ~2 detik buat import torch/opencv/ultralytics sebelum uvicorn mulai
# listen, sementara Vite siap dalam <1 detik — tanpa nunggu ini, request
# pertama dari browser/Vite proxy ke /api/* nyasar duluan sebelum backend
# ada yang dengar, muncul "ECONNREFUSED" di log (harmless, tapi bikin
# bingung karena kelihatan kayak error asli).
echo "Menunggu backend siap..."
for i in $(seq 1 60); do
  curl -s -o /dev/null "http://127.0.0.1:8000/api/cameras" 2>/dev/null && break
  sleep 0.5
done

cd frontend
npm run dev &
cd ..

CLEANED_UP=0
cleanup() {
  [ "$CLEANED_UP" = 1 ] && return
  CLEANED_UP=1
  echo ""
  echo "Menghentikan backend & frontend..."
  kill_and_wait "backend/venv/bin/uvicorn app:app"
  kill_and_wait "frontend/node_modules/.bin/vite"
}
trap cleanup EXIT INT TERM

echo "Backend  : http://localhost:8000"
echo "Frontend : http://localhost:5173  (mode dev, auto-reload)"
echo "Tekan Ctrl+C untuk menghentikan keduanya."

wait
