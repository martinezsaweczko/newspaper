#!/usr/bin/env bash
# Smoke-test a built container image (used by .github/workflows/pipeline.yml, runnable locally):
#   scripts/smoke-image.sh localhost/newspaper:smoke
# Generates synthetic editions, creates a user with the image's own CLI, then checks /login, a
# real login, a rendered front page (proves poppler-utils is in the image), the HEALTHCHECK and
# the LAN-only /metrics port. Prints the container logs on failure.
set -euo pipefail

IMAGE=${1:?usage: scripts/smoke-image.sh <image>}
APP_PORT=${SMOKE_APP_PORT:-3000}
METRICS_PORT=${SMOKE_METRICS_PORT:-9464}
ENGINE=${ENGINE:-podman}
NAME="newspaper-smoke-$$"
VOLUME="newspaper-smoke-data-$$"
WORK=$(mktemp -d)
USER_NAME=smoke
USER_PASSWORD=smoke-password-123

cleanup() {
	status=$?
	if [ "$status" -ne 0 ]; then
		echo "--- smoke test failed (exit $status); container logs:"
		"$ENGINE" logs "$NAME" 2>&1 || true
	fi
	"$ENGINE" rm -f "$NAME" >/dev/null 2>&1 || true
	"$ENGINE" volume rm -f "$VOLUME" >/dev/null 2>&1 || true
	rm -rf "$WORK"
	exit "$status"
}
trap cleanup EXIT

fail() {
	echo "FAIL: $*" >&2
	exit 1
}

node scripts/make-samples.mjs "$WORK/samples"
chmod -R a+rX "$WORK/samples"

"$ENGINE" volume create "$VOLUME" >/dev/null
"$ENGINE" run --rm -v "$VOLUME:/data" "$IMAGE" \
	node scripts/user.ts add "$USER_NAME" --password "$USER_PASSWORD"

"$ENGINE" run -d --name "$NAME" \
	-p "127.0.0.1:$APP_PORT:3000" -p "127.0.0.1:$METRICS_PORT:9464" \
	-e SESSION_SECRET="smoke-secret-$(date +%s)-0123456789abcdefghij" \
	-v "$WORK/samples:/newspapers:ro,Z" -v "$VOLUME:/data" \
	"$IMAGE" >/dev/null

BASE="http://127.0.0.1:$APP_PORT"
code=000
for _ in $(seq 1 60); do
	code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/login" || true)
	[ "$code" = 200 ] && break
	sleep 1
done
echo "GET /login -> $code"
[ "$code" = 200 ] || fail "/login did not answer 200"

JAR="$WORK/cookies"
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -H "Origin: $BASE" \
	-H 'Accept: text/html' --data "username=$USER_NAME&password=$USER_PASSWORD" "$BASE/login")
echo "POST /login -> $code"
grep -q np_session "$JAR" || fail "login did not set the session cookie"

id=$(curl -s -b "$JAR" "$BASE/" | grep -o '/thumb/[A-Za-z0-9_-]*' | head -1 | cut -d/ -f3)
[ -n "$id" ] || fail "the newsstand lists no front pages"
type=$(curl -s -b "$JAR" -o "$WORK/thumb.jpg" -w '%{http_code} %{content_type}' "$BASE/thumb/$id")
echo "GET /thumb/$id -> $type"
[ "$type" = "200 image/jpeg" ] || fail "front page was not rendered (pdftoppm missing?)"

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
echo "smoke test passed"
