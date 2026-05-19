#!/usr/bin/env bash
# ==============================================================================
# SACPROMI — Sauvegarde PostgreSQL quotidienne
# Utilisation : ./backup-db.sh
# Lecture des paramètres depuis le fichier .env du backend.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Charger .env si présent
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL non définie (vérifiez backend/.env)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="$BACKUP_DIR/sacpromi-$DATE.sql.gz"

echo "📦 Sauvegarde vers $BACKUP_FILE..."

# pg_dump avec compression gzip
pg_dump --dbname="$DATABASE_URL" --no-owner --no-privileges --clean --if-exists \
  | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Sauvegarde OK ($SIZE)"

# Rotation : garder les N derniers jours
echo "🧹 Suppression des sauvegardes > $RETENTION_DAYS jours..."
find "$BACKUP_DIR" -name "sacpromi-*.sql.gz" -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

echo "📊 Sauvegardes existantes :"
ls -lh "$BACKUP_DIR"/sacpromi-*.sql.gz 2>/dev/null | tail -10
