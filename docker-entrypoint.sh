#!/bin/sh
set -e

UPLOAD_PATH="${UPLOAD_DIR:-/app/uploads}"
BACKUP_PATH="${BACKUP_DIR:-/app/backups}"

mkdir -p "$UPLOAD_PATH" "$BACKUP_PATH"
chown -R nestjs:nodejs "$UPLOAD_PATH" "$BACKUP_PATH"

exec su-exec nestjs:nodejs "$@"
