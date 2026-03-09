# Firebase Credential Rotation Runbook

Date: 2026-03-07

## Objective

Remove repository risk from Firebase service account credentials and rotate compromised credentials.

## Current Repository Guard

- `config/firebase/google-services.json` is excluded by `.gitignore`.
- Runtime supports external credential path via `FIREBASE_SERVICE_ACCOUNT_PATH`.

## Rotation Steps

1. In Google Cloud Console, locate service account:
   - `firebase-adminsdk-fbsvc@zendlert.iam.gserviceaccount.com`
2. Revoke/delete the exposed key pair immediately.
3. Create a new key for the service account.
4. Store the new JSON key outside git-tracked paths.
5. Set deployment env var:
   - `FIREBASE_SERVICE_ACCOUNT_PATH=<absolute path to new json>`
6. Restart service and confirm startup succeeds.
7. Audit logs for Firebase auth/messaging failures after rotation.

## Local Development Setup

Use one of these safe options:
- Keep local credential file at `config/firebase/google-services.json` (ignored by git), or
- Set `FIREBASE_SERVICE_ACCOUNT_PATH` to a local secure path.

Do not commit service-account JSON content to version control.
