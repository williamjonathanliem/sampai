#!/usr/bin/env bash
# One-time GCP setup for Sampai. Run from the repo root:
#   PROJECT=my-project bash infra/setup.sh
# Needs: gcloud (logged in), bq, and billing enabled on the project.
set -euo pipefail

PROJECT="${PROJECT:?set PROJECT=<gcp project id>}"
REGION="${REGION:-asia-southeast1}"
SA="sampai-run@${PROJECT}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT"

echo "== enabling APIs"
gcloud services enable run.googleapis.com pubsub.googleapis.com firestore.googleapis.com \
  cloudscheduler.googleapis.com bigquery.googleapis.com aiplatform.googleapis.com \
  secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  routes.googleapis.com fcm.googleapis.com firebase.googleapis.com

echo "== Firestore (Native, $REGION)"
gcloud firestore databases create --location="$REGION" --type=firestore-native 2>/dev/null || echo "   (already exists)"

echo "== service account"
gcloud iam service-accounts create sampai-run --display-name="Sampai Cloud Run" 2>/dev/null || echo "   (already exists)"
for ROLE in roles/aiplatform.user roles/pubsub.editor roles/datastore.user roles/bigquery.dataEditor \
            roles/bigquery.jobUser roles/secretmanager.secretAccessor roles/firebasecloudmessaging.admin \
            roles/run.invoker roles/iam.serviceAccountTokenCreator; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$ROLE" --condition=None >/dev/null
done

echo "== Pub/Sub topics"
for T in pings bus-positions incidents; do gcloud pubsub topics create "$T" 2>/dev/null || echo "   $T exists"; done

echo "== BigQuery dataset + tables"
bq --location="$REGION" mk -d "$PROJECT:commute" 2>/dev/null || echo "   dataset exists"
bq mk -t "$PROJECT:commute.incidents" \
  id:STRING,change:STRING,type:STRING,line_id:STRING,line_name:STRING,route_id:STRING,segment_id:STRING,from_stop:STRING,to_stop:STRING,started_at:TIMESTAMP,cleared_at:TIMESTAMP,duration_min:INTEGER,rider_count:INTEGER,confidence:STRING,source:STRING,apparent_temp:FLOAT,rain_prob:FLOAT,met_warning:BOOLEAN,simulated:BOOLEAN,logged_at:TIMESTAMP 2>/dev/null || echo "   incidents exists"
bq mk -t "$PROJECT:commute.alerts" \
  id:STRING,incident_id:STRING,change:STRING,sent_at:TIMESTAMP,lead_min_before_class:INTEGER,best_option:STRING,best_on_time:BOOLEAN,generated_by:STRING,simulated:BOOLEAN 2>/dev/null || echo "   alerts exists"
bq mk -t "$PROJECT:commute.pings_sample" \
  ts:TIMESTAMP,mode:STRING,line_id:STRING,route_id:STRING,lat:FLOAT,lon:FLOAT,speed:FLOAT,motion:FLOAT,simulated:BOOLEAN 2>/dev/null || echo "   pings_sample exists"

# Latest state per incident, for Looker Studio
bq query --use_legacy_sql=false --location="$REGION" "
CREATE OR REPLACE VIEW \`$PROJECT.commute.incidents_latest\` AS
SELECT * EXCEPT(rn) FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY logged_at DESC) rn FROM \`$PROJECT.commute.incidents\`
) WHERE rn = 1" >/dev/null

echo "== done. Next: bash infra/deploy.sh"
