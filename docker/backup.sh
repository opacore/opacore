#!/bin/sh
# SQLite backup script for opacore
# Usage: ./backup.sh [backup_dir]
#
# Recommended cron entry (daily at 2 AM):
#   0 2 * * * /path/to/docker/backup.sh /path/to/backups

set -e

BACKUP_DIR="${1:-./backups}"
CONTAINER_NAME="docker-server-1"
DB_PATH="/app/data/opacore.db"
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/opacore_${TIMESTAMP}.db"

echo "Backing up opacore database..."

# Use sqlite3 .backup for a consistent snapshot (safe even while server is running)
docker exec "$CONTAINER_NAME" sqlite3 "$DB_PATH" ".backup /tmp/opacore_backup.db"
docker cp "$CONTAINER_NAME:/tmp/opacore_backup.db" "$BACKUP_FILE"
docker exec "$CONTAINER_NAME" rm -f /tmp/opacore_backup.db

echo "Backup saved to: $BACKUP_FILE"
echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Clean up old backups
if [ "$KEEP_DAYS" -gt 0 ]; then
    find "$BACKUP_DIR" -name "opacore_*.db" -mtime +"$KEEP_DAYS" -delete
    echo "Cleaned up backups older than ${KEEP_DAYS} days"
fi

echo "Done."
