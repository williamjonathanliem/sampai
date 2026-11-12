#!/usr/bin/env bash
# Build + deploy worker, api, Pub/Sub push subscriptions, Scheduler jobs, and the web app.
#   PROJECT=my-project bash infra/deploy.sh
# Optional env: GEMINI_API_KEY (else Vertex AI via the service account), ROUTES_API_KEY
set -euo pipefail

PROJECT="${PROJECT:?set PROJECT=<gcp project id>}"
REGION="${REGION:-asia-southeast1}"
SA="sampai-run@${PROJECT}.iam.gserviceaccount.com"
WEB_URL="${WEB_URL:-https://${PROJECT}.web.app}"
gcloud config set project "$PROJECT" >/dev/null

COMMON="GCP_PROJECT=$PROJECT,REGION=$REGION,DEMO_MODE=${DEMO_MODE:-true},VERTEX_LOCATION=global,PUBLIC_WEB_URL=$WEB_URL,BQ_DATASET=commute"
[ -n "${GEMINI_API_KEY:-}" ] && COMMON="$COMMON,GEMINI_API_KEY=$GEMINI_API_KEY"
[ -n "${ROUTES_API_KEY:-}" ] && COMMON="$COMMON,ROUTES_API_KEY=$ROUTES_API_KEY"

echo "== build bundles"
npm run build -w worker
npm run build -w api

echo "== deploy worker (single instance: in-memory detection window)"
gcloud run deploy worker --source worker --region "$REGION" --service-account "$SA" \
  --no-allow-unauthenticated --min-instances 1 --max-instances 1 --no-cpu-throttling \
  --set-env-vars "$COMMON,BUS_POLL=true,WEATHER_POLL=true" --quiet
WORKER_URL=$(gcloud run services describe worker --region "$REGION" --format='value(status.url)')

echo "== deploy api"
gcloud run deploy api --source api --region "$REGION" --service-account "$SA" \
  --allow-unauthenticated --set-env-vars "$COMMON,WORKER_URL=$WORKER_URL" --quiet
API_URL=$(gcloud run services describe api --region "$REGION" --format='value(status.url)')
gcloud run services add-iam-policy-binding worker --region "$REGION" --member="serviceAccount:$SA" --role=roles/run.invoker >/dev/null

echo "== Pub/Sub push subscriptions -> worker"
sub() { # name topic path
  gcloud pubsub subscriptions create "$1" --topic "$2" --push-endpoint="$WORKER_URL$3" \
    --push-auth-service-account="$SA" --ack-deadline=60 --message-retention-duration=10m 2>/dev/null \
  || gcloud pubsub subscriptions update "$1" --push-endpoint="$WORKER_URL$3" --push-auth-service-account="$SA" >/dev/null
}
sub pings-to-worker pings /pubsub/pings
sub bus-to-worker bus-positions /pubsub/bus
sub incidents-to-worker incidents /pubsub/incidents

echo "== Cloud Scheduler"
job() { # name schedule path
  gcloud scheduler jobs create http "$1" --location "$REGION" --schedule="$2" --uri="$WORKER_URL$3" --http-method=POST \
    --oidc-service-account-email="$SA" --time-zone=Asia/Kuala_Lumpur 2>/dev/null \
  || gcloud scheduler jobs update http "$1" --location "$REGION" --schedule="$2" --uri="$WORKER_URL$3" >/dev/null
}
job poll-bus "* * * * *" /poll/bus
job poll-weather "*/10 * * * *" /poll/weather
job load-gtfs "0 4 * * *" /load/gtfs

echo "== web (Firebase Hosting)"
( cd web && VITE_API_URL="$API_URL" npm run build )
npx firebase deploy --only hosting,firestore:rules --project "$PROJECT"

echo
echo "api:    $API_URL"
echo "worker: $WORKER_URL"
echo "web:    $WEB_URL"
