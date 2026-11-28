#!/usr/bin/env bash
# Smoke-test a built container image (used by .github/workflows/pipeline.yml, runnable locally):
#   scripts/smoke-image.sh localhost/newspaper:smoke
# Starts MySQL 8.4 and the app on a private network, then checks: the tables were created by the
# auto-migrate on start, /login, Google sign-in absent (button and /auth/google 404), a local admin
# made with the image's own CLI logs in and opens /admin, a rendered front page (proves
# poppler-utils is in the image), opening a PDF writes a reading_events row, the HEALTHCHECK, and
# the LAN-only /metrics port with newspaper_editions_opened_total. Prints the logs on failure.
# The database checks run inside the app container with the image's own mysql2 package and its
# DATABASE_URL: the mysql CLI of the database image cannot be relied on (on GitHub runners it
# fails with "Can't find error-message file").
set -euo pipefail

IMAGE=${1:?usage: scripts/smoke-image.sh <image>}
APP_PORT=${SMOKE_APP_PORT:-3000}
METRICS_PORT=${SMOKE_METRICS_PORT:-9464}
ENGINE=${ENGINE:-podman}
DB_IMAGE=${SMOKE_DB_IMAGE:-docker.io/library/mysql:8.4}
# names carry the PID so parallel runs (and other projects) never collide
NAME="newspaper-smoke-$$"
DB_NAME="newspaper-smoke-db-$$"
NETWORK="newspaper-smoke-net-$$"
VOLUME="newspaper-smoke-data-$$"
WORK=$(mktemp -d)
USER_NAME=smoke
USER_PASSWORD=smoke-password-123
DB_PASSWORD="smoke-db-$$-pw"

cleanup() {
	status=$?
	if [ "$status" -ne 0 ]; then
		echo "--- smoke test failed (exit $status); app logs:"
		"$ENGINE" logs "$NAME" 2>&1 || true
		echo "--- database logs (tail):"
		"$ENGINE" logs "$DB_NAME" 2>&1 | tail -50 || true
	fi
	"$ENGINE" rm -f "$NAME" "$DB_NAME" >/dev/null 2>&1 || true
	"$ENGINE" volume rm -f "$VOLUME" >/dev/null 2>&1 || true
	"$ENGINE" network rm -f "$NETWORK" >/dev/null 2>&1 || true
	rm -rf "$WORK"
	exit "$status"
}
trap cleanup EXIT

fail() {
	echo "FAIL: $*" >&2
	exit 1
}

# Run one SQL statement from the app container (mysql2 from its production node_modules, the
# DATABASE_URL the app uses) and print the rows, one per line, columns tab-separated. Errors go
# to stderr and fail the call.
SQL_JS='
const mysql = require("mysql2/promise");
(async () => {
	const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 5000 });
	try {
		const [rows] = await conn.query(process.argv[1]);
		for (const row of rows) console.log(Object.values(row).join("\t"));
	} finally {
		await conn.end();
	}
})().catch((err) => {
	console.error("sql:", err && (err.stack || err.message || err));
	process.exit(1);
});'
sql() {
	"$ENGINE" exec "$NAME" node -e "$SQL_JS" "$1"
}

node scripts/make-samples.mjs "$WORK/samples"
chmod -R a+rX "$WORK/samples"

"$ENGINE" network create "$NETWORK" >/dev/null
"$ENGINE" run -d --name "$DB_NAME" --network "$NETWORK" \
	-e MYSQL_ROOT_PASSWORD="smoke-root-$$" -e MYSQL_DATABASE=newspaper \
	-e MYSQL_USER=newspaper -e MYSQL_PASSWORD="$DB_PASSWORD" \
	"$DB_IMAGE" >/dev/null

"$ENGINE" volume create "$VOLUME" >/dev/null
"$ENGINE" run --rm -v "$VOLUME:/data" "$IMAGE" \
	node scripts/user.ts add "$USER_NAME" --password "$USER_PASSWORD"

# the app waits for MySQL itself (waitForDb), then applies the migrations
"$ENGINE" run -d --name "$NAME" --network "$NETWORK" \
	-p "127.0.0.1:$APP_PORT:3000" -p "127.0.0.1:$METRICS_PORT:9464" \
	-e SESSION_SECRET="smoke-secret-$(date +%s)-0123456789abcdefghij" \
	-e DATABASE_URL="mysql://newspaper:$DB_PASSWORD@$DB_NAME:3306/newspaper" \
	-v "$WORK/samples:/newspapers:ro,Z" -v "$VOLUME:/data" \
	"$IMAGE" >/dev/null

BASE="http://127.0.0.1:$APP_PORT"
code=000
for _ in $(seq 1 120); do
	code=$(curl -s -o "$WORK/login.html" -w '%{http_code}' "$BASE/login" || true)
	[ "$code" = 200 ] && break
	sleep 1
done
echo "GET /login -> $code"
[ "$code" = 200 ] || fail "/login did not answer 200"

# the image must ship mysql2 (the pruned production node_modules)
"$ENGINE" exec "$NAME" test -f node_modules/mysql2/package.json ||
	fail "the image has no node_modules/mysql2"
tables=$(sql 'SHOW TABLES') || fail "SHOW TABLES failed (see the error above)"
tables=$(printf '%s\n' "$tables" | sort | tr '\n' ' ')
echo "SHOW TABLES -> $tables"
case "$tables" in
*__drizzle_migrations*messages*reading_events*users*) ;;
*) fail "the auto-migrate did not create the tables" ;;
esac

# Google is not configured: no button, and its routes are 404
if grep -q 'con Google' "$WORK/login.html"; then fail "the Google button is shown"; fi
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/auth/google")
echo "GET /auth/google -> $code"
[ "$code" = 404 ] || fail "/auth/google should be 404 without Google configured"

JAR="$WORK/cookies"
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -H "Origin: $BASE" \
	-H 'Accept: text/html' --data "username=$USER_NAME&password=$USER_PASSWORD" "$BASE/login")
echo "POST /login -> $code"
grep -q np_session "$JAR" || fail "login did not set the session cookie"

code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE/admin")
echo "GET /admin -> $code"
[ "$code" = 200 ] || fail "/admin did not answer 200 to the local admin"

curl -s -b "$JAR" "$BASE/" >"$WORK/stand.html"
id=$(grep -o '/thumb/[A-Za-z0-9_-]*' "$WORK/stand.html" | head -1 | cut -d/ -f3)
[ -n "$id" ] || fail "the newsstand lists no front pages"
type=$(curl -s -b "$JAR" -o "$WORK/thumb.jpg" -w '%{http_code} %{content_type}' "$BASE/thumb/$id")
echo "GET /thumb/$id -> $type"
[ "$type" = "200 image/jpeg" ] || fail "front page was not rendered (pdftoppm missing?)"

type=$(curl -s -b "$JAR" -o "$WORK/edition.pdf" -w '%{http_code} %{content_type}' "$BASE/pdf/$id")
echo "GET /pdf/$id -> $type"
[ "$type" = "200 application/pdf" ] || fail "the PDF was not served"
rows=0
for _ in $(seq 1 10); do
	rows=$(sql "SELECT COUNT(*) FROM reading_events WHERE local_username = '$USER_NAME'") ||
		fail "counting reading_events failed (see the error above)"
	[ "$rows" = 1 ] && break
	sleep 0.5
done
echo "reading_events rows for $USER_NAME -> $rows"
[ "$rows" = 1 ] || fail "opening a PDF did not write one reading_events row"

healthy=no
for _ in $(seq 1 20); do
	if "$ENGINE" healthcheck run "$NAME" >/dev/null 2>&1; then
		healthy=yes
		break
	fi
	sleep 2
done
echo "healthcheck -> $healthy"
[ "$healthy" = yes ] || fail "HEALTHCHECK did not pass"

code=$(curl -s -o "$WORK/metrics" -w '%{http_code}' "http://127.0.0.1:$METRICS_PORT/metrics")
echo "GET :$METRICS_PORT/metrics -> $code"
[ "$code" = 200 ] || fail "/metrics did not answer 200 (is the source address in METRICS_ALLOW?)"
grep -E '^newspaper_(logins_total|thumbnail_renders_total|editions)' "$WORK/metrics" ||
	fail "no newspaper_ series in /metrics"
grep -E '^newspaper_editions_opened_total\{.*kind="open"' "$WORK/metrics" ||
	fail "newspaper_editions_opened_total did not count the opening"
echo "smoke test passed"
