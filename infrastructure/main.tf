/**
 * BabyGuide AI — Terraform IaC
 * Provisions: Cloud Run, Firestore, Cloud Storage, Secret Manager
 */

terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "babyguide-ai-tf-state"
    prefix = "terraform/state"
  }
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "gemini_api_key" {
  description = "Gemini API key (stored in Secret Manager)"
  type        = string
  sensitive   = true
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ─── Enable APIs ──────────────────────────────────────────────────────────────

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "aiplatform.googleapis.com",
    "cloudbuild.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# ─── Secret Manager ───────────────────────────────────────────────────────────

resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id = "gemini-api-key"
  replication { auto {} }
  depends_on = [google_project_service.apis["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_version" "gemini_api_key" {
  secret      = google_secret_manager_secret.gemini_api_key.id
  secret_data = var.gemini_api_key
}

# ─── Firestore ────────────────────────────────────────────────────────────────

resource "google_firestore_database" "babyguide" {
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.apis["firestore.googleapis.com"]]
}

# ─── Cloud Storage ────────────────────────────────────────────────────────────

resource "google_storage_bucket" "sessions" {
  name          = "${var.project_id}-babyguide-sessions"
  location      = var.region
  force_destroy = false

  lifecycle_rule {
    condition { age = 30 }
    action { type = "Delete" }
  }
}

# ─── Service Account ──────────────────────────────────────────────────────────

resource "google_service_account" "babyguide_backend" {
  account_id   = "babyguide-backend"
  display_name = "BabyGuide AI Backend"
}

resource "google_project_iam_member" "firestore_access" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.babyguide_backend.email}"
}

resource "google_project_iam_member" "storage_access" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.babyguide_backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_secret_access" {
  secret_id = google_secret_manager_secret.gemini_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.babyguide_backend.email}"
}

# ─── Cloud Run ────────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "backend" {
  name     = "babyguide-backend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.babyguide_backend.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = "gcr.io/${var.project_id}/babyguide-backend:latest"

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "USE_FIRESTORE"
        value = "true"
      }

      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.sessions.name
      }
    }
  }

  depends_on = [google_project_service.apis["run.googleapis.com"]]
}

# Allow unauthenticated access (for demo purposes — add auth for production)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  name     = google_cloud_run_v2_service.backend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ─── Outputs ──────────────────────────────────────────────────────────────────

output "backend_url" {
  description = "Cloud Run backend URL"
  value       = google_cloud_run_v2_service.backend.uri
}

output "sessions_bucket" {
  description = "Cloud Storage bucket for sessions"
  value       = google_storage_bucket.sessions.name
}
