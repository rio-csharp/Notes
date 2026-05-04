# Notes

Private Markdown notes content for CodeCafe.

## Purpose

This repository stores the read-only source notes that CodeCafe mounts into the
API at runtime. It is separate from the application repository so notes can be
updated and deployed without rebuilding the CodeCafe application images.

## Deployment

The GitHub Actions workflow in this repository syncs the committed note content
to the target server path:

```text
/home/deploy/codecafe/notes
```

CodeCafe then reads the mounted content inside the API container from:

```text
/data/notes
```

## Required Repository Secrets

```text
TEST_SSH_HOST
TEST_SSH_PORT
TEST_SSH_USER
TEST_SSH_PRIVATE_KEY
PRODUCTION_SSH_HOST
PRODUCTION_SSH_PORT
PRODUCTION_SSH_USER
PRODUCTION_SSH_PRIVATE_KEY
```

## Recommended Repository Variables

```text
NOTES_CONTENT_PATH=/home/deploy/codecafe/notes
NOTES_SYNC_PRODUCTION_ENABLED=false
```
