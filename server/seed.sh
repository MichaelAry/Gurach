#!/usr/bin/env bash
set -Eeuo pipefail
set +x

# Explicit settings only: never couple fixtures to files in a developer's home.
COVER_PATH=${COVER_PATH:?Set COVER_PATH to a local image file}
AUDIO_PATH=${AUDIO_PATH:?Set AUDIO_PATH to a local audio file}
API_URL=${API_URL:-http://localhost:5000}
AUTH_HEADER_FILE=${AUTH_HEADER_FILE:?Set AUTH_HEADER_FILE to an owner-only file containing the Authorization Bearer header}
if [[ ! -f "$AUTH_HEADER_FILE" || ! -r "$AUTH_HEADER_FILE" || ! -O "$AUTH_HEADER_FILE" ]]; then
  echo "AUTH_HEADER_FILE must be a readable file owned by this user" >&2
  exit 2
fi
HEADER_MODE=$(stat -c '%a' "$AUTH_HEADER_FILE")
if (( (8#$HEADER_MODE & 077) != 0 )); then
  echo "AUTH_HEADER_FILE must not be accessible to group or others" >&2
  exit 2
fi
COUNT=${COUNT:-10}
REQUEST_DELAY_MS=${REQUEST_DELAY_MS:-700}

if [[ ! -f "$COVER_PATH" || ! -r "$COVER_PATH" ]]; then
  echo "COVER_PATH must be a readable file" >&2
  exit 2
fi
if [[ ! -f "$AUDIO_PATH" || ! -r "$AUDIO_PATH" ]]; then
  echo "AUDIO_PATH must be a readable file" >&2
  exit 2
fi
if [[ ! "$COUNT" =~ ^[1-9][0-9]*$ || ${#COUNT} -gt 3 ]]; then
  echo "COUNT must be an integer between 1 and 100" >&2
  exit 2
fi
COUNT_VALUE=$((10#$COUNT))
if (( COUNT_VALUE > 100 )); then
  echo "COUNT must be an integer between 1 and 100" >&2
  exit 2
fi
if [[ ! "$REQUEST_DELAY_MS" =~ ^[0-9]+$ || ${#REQUEST_DELAY_MS} -gt 5 ]]; then
  echo "REQUEST_DELAY_MS must be at least 650 to stay below the default 100/min global throttle" >&2
  exit 2
fi
REQUEST_DELAY_VALUE=$((10#$REQUEST_DELAY_MS))
if (( REQUEST_DELAY_VALUE < 650 )); then
  echo "REQUEST_DELAY_MS must be at least 650 to stay below the default 100/min global throttle" >&2
  exit 2
fi
if [[ ! "$API_URL" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "API_URL must be an HTTP(S) URL" >&2
  exit 2
fi
API_URL=${API_URL%/}
TRACKS_URL="$API_URL/tracks"

if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' "$TRACKS_URL")" != 200 ]]; then
  echo "Track API is not responding at API_URL" >&2
  exit 1
fi

if ! curl --silent --fail --header "@$AUTH_HEADER_FILE" "$API_URL/auth/me" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{process.exit(JSON.parse(s).user.role==="admin"?0:1)}catch{process.exit(1)}})'; then
  echo "Seed requires an active explicit admin session" >&2
  exit 1
fi

echo "Creating $COUNT tracks at $TRACKS_URL (delay ${REQUEST_DELAY_MS}ms)"
ok=0
fail=0
for ((i = 1; i <= COUNT_VALUE; i++)); do
  name="Track $i"
  artist="Artist $(((i - 1) % 10 + 1))"
  text="Lyrics for track #$i — line 1
Line 2 of track #$i
Line 3 of track #$i"
  status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --request POST "$TRACKS_URL" \
    --header "@$AUTH_HEADER_FILE" \
    --form "picture=@$COVER_PATH" \
    --form "audio=@$AUDIO_PATH" \
    --form-string "name=$name" \
    --form-string "artist=$artist" \
    --form-string "text=$text")
  if [[ "$status" == 201 || "$status" == 200 ]]; then
    ((ok += 1))
  else
    ((fail += 1))
    echo "Track $i failed (HTTP $status)" >&2
  fi
  printf '\rCompleted %d/%d (success %d, failed %d)' "$i" "$COUNT" "$ok" "$fail"
  if (( i < COUNT_VALUE )); then
    sleep "$((REQUEST_DELAY_VALUE / 1000)).$(printf '%03d' "$((REQUEST_DELAY_VALUE % 1000))")"
  fi
done
printf '\nSuccess: %d; failed: %d\n' "$ok" "$fail"
(( fail == 0 ))
