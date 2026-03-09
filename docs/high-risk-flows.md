# High-Risk Flow Samples

Snapshot date: 2026-03-07

This file captures representative request/response contract samples for critical flows.
Samples are based on current controller logic and are intended as baseline references for behavior-preserving refactors.

## Guardrails

- Do not change endpoint paths.
- Do not change request fields without explicit contract approval.
- Do not change response JSON shape/field names/status behavior unless explicitly approved.
- Do not change auth flow semantics or Prisma schema as part of refactor-only work.

## Auth Flow

### POST `/api/v1/organizations/refresh`

Request body sample:

```json
{
  "refreshToken": "<jwt_refresh_token>"
}
```

Success response sample (`200`):

```json
{
  "accessToken": "<jwt_access_token>",
  "refreshToken": "<jwt_refresh_token_rotated>"
}
```

Error response samples:

```json
{
  "message": "Refresh token is required."
}
```

Status-only response:
- `403` with empty body (`sendStatus(403)`) for invalid/reused refresh token cases.

### POST `/api/v1/organizations/logout`

Request:
- No JSON body required in current implementation; expects `jwt` cookie if present.

Response:
- `204` No Content

## Organization Creation / Login Flow

### POST `/api/v1/organizations/send-otp`

Request body sample:

```json
{
  "email": "admin@acme.com",
  "purpose": "LOGIN"
}
```

Success response sample (`200`):

```json
{
  "success": true,
  "message": "Login OTP sent successfully.",
  "dev_otp": "111111"
}
```

### POST `/api/v1/organizations/verify-otp`

Request body sample:

```json
{
  "email": "admin@acme.com",
  "otp": "111111",
  "purpose": "LOGIN"
}
```

Success response sample (`200`):

```json
{
  "verified": true,
  "message": "OTP verified successfully."
}
```

Error response sample (`401`):

```json
{
  "verified": false,
  "message": "Invalid or expired OTP."
}
```

### POST `/api/v1/organizations/login-otp`

Request body sample:

```json
{
  "email": "admin@acme.com",
  "otp": "111111"
}
```

Success response sample (`200`):

```json
{
  "success": true,
  "message": "Login successful",
  "accessToken": "<jwt_access_token>",
  "refreshToken": "<jwt_refresh_token>",
  "user": {
    "user_id": "<uuid>",
    "organization_id": "<uuid>",
    "organization_name": "Acme Corp",
    "email": "admin@acme.com",
    "name": "Jane Admin",
    "role": "admin"
  }
}
```

### POST `/api/v1/organizations/create-organization`

Request body sample:

```json
{
  "organization_name": "Acme Corp",
  "full_name": "Jane Admin",
  "email": "admin@acme.com",
  "time_zone": "UTC"
}
```

Success response sample (`200`):

```json
{
  "message": "Organization created successfully",
  "organization": {
    "organization_id": "<uuid>",
    "name": "Acme Corp"
  },
  "accessToken": "<jwt_access_token>",
  "refreshToken": "<jwt_refresh_token>",
  "user": {
    "email": "admin@acme.com",
    "name": "Jane",
    "role": "admin",
    "user_id": "<uuid>",
    "organization_id": "<uuid>"
  }
}
```

## Admin Actions Flow

### POST `/api/v1/admin/users`

Request body sample:

```json
{
  "first_name": "John",
  "last_name": "Worker",
  "email": "john.worker@acme.com",
  "phone_number": "+15551234567",
  "admin_access": false,
  "is_employee": true,
  "site_id": "<uuid>",
  "area_id": "<uuid>"
}
```

Success response sample (`200`):

```json
{
  "message": "Employee created successfully. Setup email sent.",
  "user": {
    "id": "<uuid>",
    "name": "John Worker",
    "email": "john.worker@acme.com",
    "role": "employee",
    "user_type": "employee"
  }
}
```

### POST `/api/v1/admin/alerts`

Request body sample:

```json
{
  "emergency_type_id": "<uuid>",
  "message": "Immediate evacuation required",
  "start_time": "2026-03-07T10:00:00.000Z",
  "end_time": "2026-03-07T11:00:00.000Z"
}
```

Success response sample (`201`):

```json
{
  "message": "Alert created successfully",
  "alert_id": "<uuid>"
}
```

## Alert Creation / Alert Response Flow

### POST `/api/v1/alert`

Request body sample:

```json
{
  "alert_type": "Fire",
  "severity_level": "critical",
  "alert_message": "Fire reported near Site A",
  "send_sms": true,
  "response_required": true,
  "timing_details": {
    "timing": "send_now"
  },
  "selected_area_details": {
    "site_selections": [
      {
        "site_id": "<uuid>",
        "area_ids": [
          "<uuid>"
        ]
      }
    ]
  }
}
```

Success response sample (`201`):

```json
{
  "message": "Alert has been successfully queued for dispatch.",
  "alert_id": "<uuid>",
  "status": "active",
  "recipients_planned": 42
}
```

### PUT `/api/v1/alert/:alertId/resolve`

Request body sample:

```json
{
  "message": "Issue resolved by onsite team."
}
```

Success response sample (`200`):

```json
{
  "success": true,
  "message": "Alert resolved successfully."
}
```

### POST `/api/v1/employee/respond-to-alert`

Request body sample:

```json
{
  "alert_id": "<uuid>",
  "response": "safe",
  "latitude": 40.7128,
  "longitude": -74.006,
  "location_name": "Warehouse Gate 2"
}
```

Success response sample (`200`):

```json
{
  "message": "Response recorded successfully",
  "recipient": {
    "id": "<uuid>",
    "alert_id": "<uuid>",
    "user_id": "<uuid>",
    "response": "safe"
  },
  "location_saved": true,
  "location": {
    "id": "<uuid>",
    "user_id": "<uuid>",
    "alert_id": "<uuid>"
  }
}
```

## Subscription / Plan Flow

### POST `/api/v1/subscriptions/create`

Request body sample:

```json
{
  "plan_id": "<uuid>",
  "organization_id": "<uuid>",
  "payment_method_id": "pm_1234567890",
  "customer_name": "Acme Billing",
  "address": {
    "line1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "postal_code": "10001",
    "country": "US"
  }
}
```

Success response sample (`200`, active):

```json
{
  "message": "Subscription created successfully",
  "subscriptionId": "<uuid>",
  "stripeId": "sub_1234567890",
  "status": "active"
}
```

Alternate success response sample (`200`, incomplete):

```json
{
  "message": "Payment confirmation required",
  "status": "incomplete",
  "subscriptionId": "<uuid>",
  "stripeId": "sub_1234567890",
  "clientSecret": "pi_..._secret_..."
}
```

### POST `/api/v1/subscriptions/preview`

Request body sample:

```json
{
  "planId": "<uuid>",
  "zip": "10001"
}
```

Success response sample (`200`):

```json
{
  "subtotal": 99,
  "tax": 7.92,
  "total": 106.92,
  "currency": "usd"
}
```

### GET `/api/v1/subscriptions/status`

Success response sample (`200`):

```json
{
  "success": true,
  "data": {
    "plan_name": "Professional",
    "amount_charged": "99.00",
    "billing_cycle": "Monthly",
    "payment_date": "2026-03-01T00:00:00.000Z",
    "payment_status": "Successful",
    "next_billing_date": "2026-04-01T00:00:00.000Z",
    "next_amount": "99.00"
  }
}
```

### POST `/api/v1/subscriptions/webhook`

Success response sample (`200`):

```json
{
  "received": true
}
```

### GET `/api/v1/plans`

Success response sample (`200`):

```json
{
  "success": true,
  "data": [
    {
      "id": "<uuid>",
      "name": "Starter",
      "tagline": "For small teams",
      "currency": "INR",
      "price": 49,
      "originalPrice": null,
      "features": [
        "Up to 50 Users"
      ],
      "isCurrentPlan": false,
      "renewsAt": null,
      "stripePriceId": "price_123"
    }
  ]
}
```

## Notes

- These are representative contract snapshots, not exhaustive cases.
- For refactors, preserve keys and response nesting exactly unless a specific bug fix is explicitly approved and documented.

## Middleware Coverage and Auth Expectations Per Router

Snapshot source:
- `app.js`
- `routes/*.js`
- `middlewares/verifyAdminAccess.js`

### App-level middleware baseline

- `helmet` (or fallback security headers when unavailable)
- `cors` with configured origin strategy
- request-id assignment (`req.requestId`) and request start/finish logging
- `express.json` and `express.urlencoded` with body size limit
- `express.raw` for `/api/v1/subscriptions/webhook`
- centralized error handler

### Router-level coverage matrix

| Mounted Prefix | Router File | Route-Level Middleware | Current Auth Enforcement | Auth Expectation (Baseline) |
|---|---|---|---|---|
| `/api/v1/admin` | `routes/admin.routes.js` | `router.use(verifyAdminAccess)` | Admin JWT required on all routes | Keep admin-only guard behavior unchanged |
| `/api/v1/alert` | `routes/alert.routes.js` | `router.use(verifyAdminAccess)` + inline param->body mapper on resolve route | Admin JWT required on all routes | Keep admin-only guard behavior unchanged |
| `/api/v1/analytics` | `routes/analytics.routes.js` | `router.use(verifyAdminAccess)` | Admin JWT required on all routes | Keep admin-only guard behavior unchanged |
| `/api/v1/organizations` | `routes/organization.routes.js` | none | No route-level auth middleware | Keep public endpoints public; document which endpoints rely on `req.user` in controller and need explicit auth strategy later |
| `/api/v1/employee` | `routes/employee.routes.js` | none | No route-level auth middleware | `POST /login` should remain public; endpoints using `req.user` should be explicitly protected in later middleware phase |
| `/api/v1/settings` | `routes/settings.routes.js` | none | No route-level auth middleware | Document and align expected access model before adding guards |
| `/api/v1/subscriptions` | `routes/subscription.routes.js` | route-specific `express.raw` on `/webhook` | No route-level auth middleware | `/webhook` should remain public; create/preview/status should use explicit auth strategy in later phase |
| `/api/v1/plans` | `routes/plan.routes.js` | none | No route-level auth middleware | Route currently uses `req.user` in controller, so expected protected access should be documented before changes |
| `/api/v1/config` | `routes/config.routes.js` | none | No route-level auth middleware | Document intended protection/ownership checks before middleware changes |
| `/api/v1/users` | `routes/user.routes.js` | none | No route-level auth middleware | Document intended protection/ownership checks before middleware changes |

### `verifyAdminAccess` behavior contract (current)

- Reads bearer token from `Authorization` header.
- Verifies JWT using `ACCESS_TOKEN_SECRET`.
- Requires decoded `role` to equal `"admin"` (case-insensitive).
- On deny:
  - `401` with `{ "message": "Unauthorized" }` for missing/invalid bearer format.
  - `403` with one of:
    - `{ "message": "Forbidden: Invalid Token" }`
    - `{ "message": "Forbidden: Token Expired" }`
    - `{ "message": "Forbidden: Access is denied. Admins only." }`
