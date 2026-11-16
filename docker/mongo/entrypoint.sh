#!/usr/bin/env bash
set -Eeuo pipefail

stage=keyfile
trap 'code=$?; printf "gurach-mongo stage=%s exit=%s\n" "$stage" "$code" >&2; exit "$code"' ERR
# Keep install errors private: diagnostics must never echo key material.
install --owner=mongodb --group=mongodb --mode=0400 /run/mongo-keyfile /tmp/mongo-keyfile 2>/dev/null
printf 'gurach-mongo stage=keyfile exit=0\n'
stage=init
exec /usr/local/bin/docker-entrypoint.sh "$@" --keyFile /tmp/mongo-keyfile
