#!/usr/bin/env bash
# Preparación de un servidor Ubuntu (Oracle Cloud, ARM o x86) para Luna 2.0.
# Instala Node.js 20, Ollama y el modelo definido en config.json.
# Uso: bash deploy/setup-oracle.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v curl >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y curl
fi

# Node.js 18+
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'parseInt(process.versions.node)')" -lt 18 ]; then
  echo "==> Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "==> Node $(node --version)"

# Ollama
if ! command -v ollama >/dev/null 2>&1; then
  echo "==> Instalando Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi
sudo systemctl enable --now ollama 2>/dev/null || true

# Modelo indicado en config.json
MODELO="$(node -p 'JSON.parse(require("fs").readFileSync("config.json","utf8")).modelo.modelo')"
echo "==> Descargando modelo $MODELO (puede tardar varios minutos)..."
ollama pull "$MODELO"

echo ""
echo "✔ Todo listo. Arranca a Luna dentro de tmux para que sobreviva a tu desconexión:"
echo "    tmux new -s luna"
echo "    node index.js"
echo "  (salir sin cerrar: Ctrl+B luego D · volver: tmux attach -t luna)"
