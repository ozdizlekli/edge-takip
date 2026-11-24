#!/bin/zsh
cd "$(dirname "$0")"
URL="http://127.0.0.1:4173"

# Finder uzerinden calistirildiginda nvm / homebrew PATH yuklenmeyebilir; node'u bul
NODE_BIN="$(command -v node 2>/dev/null)"
if [[ -z "$NODE_BIN" && -x "/Users/zehrasila/.nvm/versions/node/v22.18.0/bin/node" ]]; then
  NODE_BIN="/Users/zehrasila/.nvm/versions/node/v22.18.0/bin/node"
fi
if [[ -z "$NODE_BIN" && -d "$HOME/.nvm/versions/node" ]]; then
  NODE_BIN="$(ls -1d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -n 1)"
fi
if [[ -z "$NODE_BIN" && -x "/opt/homebrew/bin/node" ]]; then
  NODE_BIN="/opt/homebrew/bin/node"
fi
if [[ -z "$NODE_BIN" && -x "/usr/local/bin/node" ]]; then
  NODE_BIN="/usr/local/bin/node"
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js bulunamadı, dosya doğrudan tarayıcıda açılıyor..."
  open "public/index.html"
  exit 0
fi

echo "TÜBİTAK 2209-A Proje Takip Paneli başlatılıyor..."
echo "Node: $NODE_BIN"
echo "Tarayıcı adresi: $URL"
(sleep 1 && open "$URL") &
"$NODE_BIN" server.js
