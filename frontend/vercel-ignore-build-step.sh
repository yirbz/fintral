#!/bin/bash
if [ "$VERCEL_GIT_COMMIT_REF" == "staging" ] || [ "$VERCEL_GIT_COMMIT_REF" == "main" ]; then
  # Proceed with build
  exit 1
else
  # Ignore build
  exit 0
fi
