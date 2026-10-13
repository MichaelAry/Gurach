#!/bin/bash
set -e

# ---- Настройки ----
COVER="$HOME/Cover.jpg"
AUDIO="$HOME/islam.mp3"
URL="http://localhost:5000/tracks"
COUNT=100

# ---- Проверки ----
if [ ! -f "$COVER" ]; then
  echo "❌ Не найдена картинка: $COVER"
  exit 1
fi

if [ ! -f "$AUDIO" ]; then
  echo "❌ Не найден аудиофайл: $AUDIO"
  exit 1
fi

# ---- Проверка, что сервер отвечает ----
if ! curl -s -o /dev/null -w "%{http_code}" "$URL" | grep -q "200"; then
  echo "❌ Сервер не отвечает на $URL"
  exit 1
fi

echo "▶ Создаю $COUNT треков..."
echo "  Cover: $COVER"
echo "  Audio: $AUDIO"
echo ""

OK=0
FAIL=0

for i in $(seq 1 $COUNT); do
  # Генерируем осмысленные разные данные
  NAME="Track $i"
  ARTIST="Artist $(( (i - 1) % 10 + 1 ))"
  TEXT="Lyrics for track #$i — line 1
Line 2 of track #$i
Line 3 of track #$i"

  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL" \
    -F "picture=@$COVER" \
    -F "audio=@$AUDIO" \
    -F "name=$NAME" \
    -F "artist=$ARTIST" \
    -F "text=$TEXT")

  if [ "$HTTP" = "201" ] || [ "$HTTP" = "200" ]; then
    OK=$((OK + 1))
    printf "\r✔ %d/%d (последний: HTTP %s)   " "$OK" "$COUNT" "$HTTP"
  else
    FAIL=$((FAIL + 1))
    printf "\r✖ %d/%d (последний: HTTP %s, track %d)   " "$OK" "$COUNT" "$HTTP" "$i"
    echo ""
  fi
done

echo ""
echo ""
echo "=== Готово ==="
echo "Успешно: $OK"
echo "Ошибок:  $FAIL"
