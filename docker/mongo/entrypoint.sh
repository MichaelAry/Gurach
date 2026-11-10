#!/usr/bin/env bash
set -Eeuo pipefail

install --owner=mongodb --group=mongodb --mode=0400 /run/mongo-keyfile /tmp/mongo-keyfile
exec /usr/local/bin/docker-entrypoint.sh "$@" --keyFile /tmp/mongo-keyfile
