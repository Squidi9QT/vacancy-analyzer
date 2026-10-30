#!/usr/bin/env bash
# Сохранить план выполнения запроса: scripts/explain.sh <база> <файл.sql> <куда.txt>
# EXPLAIN (ANALYZE, BUFFERS) реально ВЫПОЛНЯЕТ запрос и показывает время и чтения
# по каждому узлу плана. Для запросов, меняющих данные, его оборачивают в BEGIN … ROLLBACK.
set -euo pipefail
db="$1"; sql="$2"; out="$3"
{
  echo "-- База: $db; запрос: $sql; дата: $(date '+%Y-%m-%d %H:%M')"
  echo "-- Объём: $(psql -d "$db" -tAc "select count(*) from vacancy") вакансий, $(psql -d "$db" -tAc "select count(*) from vacancy_snapshot") версий"
  echo
  (echo "EXPLAIN (ANALYZE, BUFFERS)"; grep -v '^--' "$sql") | psql -d "$db" -tA
} > "$out"
grep "Execution Time" "$out"
