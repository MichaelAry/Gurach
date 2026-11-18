#!/bin/sh
set -eu
umask 077
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
state=${GURACH_INSTALL_DIR:-"$HOME/.local/share/gurach"}
mkdir -p "$state"
state=$(CDPATH='' cd -- "$state" && pwd)
chmod 700 "$state"
exec 9>"$state/install.lock"
flock -n 9 || { echo 'Gurach installation is already running.' >&2; exit 1; }

admin() {
    if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi
}

engine() {
    docker --host unix:///var/run/docker.sock "$@"
}

docker_cmd() {
    if [ "$docker_as_root" = yes ]; then admin docker --host unix:///var/run/docker.sock "$@"; else engine "$@"; fi
}

docker_as_root=no
if ! engine info >/dev/null 2>&1 || ! engine compose version >/dev/null 2>&1; then
    if [ -S /var/run/docker.sock ] && engine compose version >/dev/null 2>&1 &&
        admin docker --host unix:///var/run/docker.sock info >/dev/null 2>&1; then
        docker_as_root=yes
    else
        . /etc/os-release
        if [ "${ID:-}" != ubuntu ] || [ "${VERSION_ID:-}" != 24.04 ] ||
            [ "$(uname -m)" != x86_64 ] || [ ! -d /run/systemd/system ]; then
            echo 'Automatic Docker installation requires Ubuntu 24.04 x64 with systemd.' >&2
            exit 1
        fi
        if engine compose version >/dev/null 2>&1; then
            :
        elif dpkg-query -W -f='${db:Status-Status}' docker.io 2>/dev/null | grep -qx installed; then
            admin apt-get update
            admin env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-v2
        else
            admin apt-get update
            admin env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl
            admin install -d -m 0755 /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$state/docker.asc"
            admin install -m 0644 "$state/docker.asc" /etc/apt/keyrings/docker.asc
            printf '%s\n' 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable' |
                admin tee /etc/apt/sources.list.d/gurach-docker.list >/dev/null
            admin apt-get update
            admin env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        fi
        admin systemctl enable --now docker
        if ! engine info >/dev/null 2>&1; then docker_as_root=yes; fi
    fi
fi
docker_cmd info >/dev/null
docker_cmd compose version

if [ ! -s "$state/install.env" ]; then
    for key in MONGO_KEY MONGO_ROOT_PASSWORD MONGO_APP_PASSWORD CACHE_SECRET INITIAL_PASSWORD; do
        printf 'GURACH_%s=%s\n' "$key" "$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
    done > "$state/install.env.tmp"
    mv "$state/install.env.tmp" "$state/install.env"
fi

payload="$state/runtime"
mkdir -p "$payload/deploy" "$payload/docker/mongo"
cp "$source_dir/deploy/compose.yml" "$source_dir/deploy/mongo-ready.js" "$source_dir/deploy/setup.mjs" "$payload/deploy/"
cp "$source_dir/docker/mongo/"*.js "$source_dir/docker/mongo/"*.sh "$payload/docker/mongo/"
# Bind-mounted scripts must be readable by the unprivileged container users.
chmod 644 "$payload/deploy/"* "$payload/docker/mongo/"*
compose() {
    docker_cmd compose --env-file "$state/images.env" --env-file "$state/install.env" -f "$payload/deploy/compose.yml" "$@"
}

if [ -f "$source_dir/deploy/images.env" ]; then
    cp "$source_dir/deploy/images.env" "$state/images.env"
    compose pull mongodb api client
else
    printf 'GURACH_NODE_VERSION=%s\n' "$(cat "$source_dir/.node-version")" > "$state/images.env"
    docker_cmd compose --env-file "$state/images.env" --env-file "$state/install.env" \
        -f "$source_dir/deploy/compose.yml" -f "$source_dir/deploy/compose.build.yml" build api client
fi

if ! compose up -d --wait --wait-timeout 180; then
    compose logs --no-color --tail 35 mongodb setup api client 2>&1 | tee "$state/install-error.log" >&2
    printf 'Setup log: %s/install-error.log\n' "$state" >&2
    exit 1
fi
web_port=${GURACH_WEB_PORT:-$(sed -n 's/^GURACH_WEB_PORT=//p' "$state/install.env")}
printf 'Gurach is ready at http://localhost:%s\nInitial account: gurach. Password: GURACH_INITIAL_PASSWORD in %s/install.env\n' "${web_port:-3000}" "$state"
