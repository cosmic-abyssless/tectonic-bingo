#!/bin/sh
# Sourced (not run) by the scripts that use rclone. Turns the BACKUP_* settings into an rclone remote called `backup`,
# so no rclone config file has to exist, and checks that nothing needed is missing.
#
# The bucket must already exist (it is created by hand once): the token is limited to it and cannot create buckets, so
# rclone is told not to try.

: "${BACKUP_ENDPOINT:?BACKUP_ENDPOINT is not set (see deploy/backup.env.example)}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set}"
: "${BACKUP_PREFIX:?BACKUP_PREFIX is not set}"
: "${BACKUP_ACCESS_KEY_ID:?BACKUP_ACCESS_KEY_ID is not set}"
: "${BACKUP_SECRET_ACCESS_KEY:?BACKUP_SECRET_ACCESS_KEY is not set}"

export RCLONE_CONFIG_BACKUP_TYPE=s3
export RCLONE_CONFIG_BACKUP_PROVIDER="${BACKUP_S3_PROVIDER:-Cloudflare}"
export RCLONE_CONFIG_BACKUP_ENDPOINT="$BACKUP_ENDPOINT"
export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="$BACKUP_ACCESS_KEY_ID"
export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="$BACKUP_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_BACKUP_REGION=auto
export RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true

# Where this environment's uploads live in the bucket.
export BACKUP_UPLOADS_REMOTE="backup:${BACKUP_BUCKET}/${BACKUP_PREFIX}/uploads"
