# AquaCare Backend — API Reference & Integration Guide

> Base URL (local): `http://localhost:3000/api`
> All authenticated routes require: `Authorization: Bearer <accessToken>`
> All responses follow: `{ success, message, data }` or `{ success, message, details }` on error.

---

## What Was Built (B1–B10 Summary)

| Step | What Was Added |
|------|---------------|
| B1 | Security hardening (rate limiting, CORS, helmet, input sanitization) — pre-existing |
| B2 | TypeScript model updates: wallet idempotency, booking `completed_at`, user-benefit model, OTP model, push-token model, payment model |
| B3 | Razorpay payment integration: create order, verify payment, webhook handler |
| B4 | Phone OTP authentication: send OTP via Fast2SMS, verify OTP, login with OTP |
| B5 | Email service (SendGrid): booking confirmation, agent assigned, booking completed, password reset |
| B6 | Admin KYC review panel: approve/reject agents & dealers, list users, vanilla HTML admin UI at `/admin` |
| B7 | Wallet welcome bonus (₹1000 on signup) + First Service Free benefit (transactional, race-condition safe) |
| B8 | Booking progress update endpoints: agent posts updates (arrived/diagnosed/in_progress/completed/photo/note), customer reads them |
| B9 | Push notifications via Expo: booking confirmed, technician assigned, technician arrived, service complete; push token registration |
| B10 | GPS location endpoints: agent updates location, go-online guard requires location, geocode reverse lookup |

---

## Auth Routes — `/api/auth`

### `POST /api/auth/signup`
**Auth:** None
**Body:**
```json
{ "name": "string", "email": "string", "phone": "string", "password": "string", "role": "customer|agent|dealer" }
```
**Returns:** `{ accessToken, refreshToken, user }`
**Side effects on success:**
- Customer: wallet created + ₹1000 welcome bonus credited + First Service Free benefit granted
- All roles: JWT pair issued

**Frontend integration (F1):**
```ts
const res = await api.post('/auth/signup', body);
await SecureStore.setItemAsync('accessToken', res.data.accessToken);
await SecureStore.setItemAsync('refreshToken', res.data.refreshToken);
```

---

### `POST /api/auth/login`
**Auth:** None
**Body:** `{ "email": "string", "password": "string" }`
**Returns:** `{ accessToken, refreshToken, user }`

---

### `POST /api/auth/send-otp`
**Auth:** None
**Body:** `{ "phone": "10-digit string" }`
**Returns:** `{ message: "OTP sent" }`
**Behavior:** Generates 6-digit OTP → bcrypt-hashed → stored in DB → sent via Fast2SMS. OTP expires in 5 min. After 5 failed attempts the OTP is locked.

**Frontend integration (F1 — OTP login screen):**
```ts
// Step 1: send OTP
await api.post('/auth/send-otp', { phone });

// Step 2: user enters OTP, verify and get tokens
const res = await api.post('/auth/verify-otp', { phone, otp });
// res.data = { accessToken, refreshToken, user }
```

---

### `POST /api/auth/verify-otp`
**Auth:** None
**Body:** `{ "phone": "10-digit string", "otp": "6-digit string" }`
**Returns:** `{ accessToken, refreshToken, user }`
**Errors:**
- `400 OTP expired` — resend needed
- `400 Too many failed attempts` — locked
- `400 Invalid OTP` — wrong code
- `404 No OTP found` — send first

---

### `POST /api/auth/forgot-password`
**Auth:** None
**Body:** `{ "email": "string" }`
**Returns:** Always `200` — "If that email exists a reset link was sent" (prevents email enumeration)
**Behavior:** Sends email with reset link containing SHA256 token, valid 1 hour.

---

### `POST /api/auth/reset-password`
**Auth:** None
**Body:** `{ "token": "string", "newPassword": "string (min 8 chars)" }`
**Returns:** `{ message: "Password reset successful" }`

---

### `POST /api/auth/refresh`
**Auth:** None
**Body:** `{ "refreshToken": "string" }`
**Returns:** `{ accessToken, refreshToken }`

---

### `POST /api/auth/logout`
**Auth:** Required
**Body:** `{ "refreshToken": "string" }`
**Returns:** `{ message: "Logged out" }`

---

### `GET /api/auth/me`
**Auth:** Required
**Returns:** Current user object `{ id, name, email, phone, role }`

---

## Bookings — `/api/bookings`

All routes require auth.

### `GET /api/bookings`
**Query params:** `page`, `pageSize`, `status` (`active` | `completed` | `cancelled`)
**Returns:** `{ data: Booking[], pagination: { page, pageSize, totalItems, totalPages } }`

**Frontend integration:** Booking history screen — call on mount, pass `status=active` for home dashboard.

---

### `POST /api/bookings`
**Body:**
```json
{
  "service_id": 1,
  "address_id": 2,
  "scheduled_date": "2026-03-10",
  "scheduled_time": "10:00",
  "notes": "optional"
}
```
**Returns:** Full booking object
**Side effects:**
- If user has unused `FIRST_SERVICE_FREE` benefit → price set to ₹0, benefit marked used (transactional + FOR UPDATE lock)
- Fire-and-forget: booking confirmation email + push notification `"Booking Confirmed"`

**Frontend integration (payment flow):**
```
Create booking → check booking.price
  if price > 0 → go to payment screen → POST /payments/create-order → Razorpay SDK → POST /payments/verify
  if price == 0 → show "First Service Free" confirmation screen
```

---

### `PATCH /api/bookings/:id/cancel`
**Returns:** `{ message: "Booking cancelled" }`
**Allowed:** Only `pending` or `confirmed` status bookings.

---

### `GET /api/bookings/:bookingId/updates`
**Auth:** Required (must be booking owner or assigned agent)
**Returns:** Array of `BookingUpdate[]` ordered ASC by `created_at`

```ts
// BookingUpdate shape:
{
  id, booking_id, agent_id,
  update_type: 'arrived' | 'diagnosed' | 'in_progress' | 'completed' | 'photo' | 'note',
  note, media_url, created_at
}
```

**Frontend integration (F3 — booking detail screen):**
Poll or listen — fetch every 30s or on push notification received to refresh the timeline.

---

## Payments — `/api/payments`

### `POST /api/payments/create-order`
**Auth:** Required
**Body:** `{ "bookingId": 1 }`
**Returns:** `{ orderId, amount, currency, key }` — pass directly to Razorpay React Native SDK

**Frontend integration (F2 — payment screen):**
```ts
const order = await api.post('/payments/create-order', { bookingId });
// Open Razorpay checkout
RazorpayCheckout.open({
  key: order.data.key,
  order_id: order.data.orderId,
  amount: order.data.amount,
  ...
}).then(async (paymentData) => {
  await api.post('/payments/verify', {
    razorpay_order_id: paymentData.razorpay_order_id,
    razorpay_payment_id: paymentData.razorpay_payment_id,
    razorpay_signature: paymentData.razorpay_signature,
  });
  // navigate to booking confirmed screen
});
```

---

### `POST /api/payments/verify`
**Auth:** Required
**Body:** `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`
**Returns:** `{ success: true, bookingId }`
**Behavior:** HMAC-SHA256 signature check → updates `payments` table → updates booking status to `confirmed`
**Errors:** `400 Invalid signature`, `400 Payment already processed`

---

### `POST /api/payments/webhook`
**Auth:** None (Razorpay server-to-server)
**Headers:** `x-razorpay-signature`
**Always returns:** `200` (even on error — webhook retry safety)
**Handles:** `payment.captured`, `payment.failed`, `refund.created`

> Configure in Razorpay Dashboard → Webhooks → `https://yourdomain.com/api/payments/webhook`

---

## User Profile — `/api/user`

All routes require auth.

### `GET /api/user/profile`
**Returns:** User profile with name, email, phone, avatar etc.

### `PATCH /api/user/profile`
**Body:** Any updatable profile fields
**Returns:** Updated profile

### `GET /api/user/addresses`
**Returns:** Array of saved addresses

### `POST /api/user/addresses`
**Body:** `{ line1, city, state, postal_code, country?, label?, latitude?, longitude?, is_default? }`
**Returns:** Created address (201)

### `PATCH /api/user/addresses/:id`
**Body:** Any subset of address fields
**Returns:** Updated address

### `PATCH /api/user/addresses/:id/default`
**Returns:** Updated address marked as default

### `DELETE /api/user/addresses/:id`
**Returns:** `{ message: "Address deleted" }`

### `POST /api/user/push-token`
**Body:** `{ "token": "ExponentPushToken[xxx]", "platform": "ios|android|web" }`
**Returns:** `{ success: true }`
**Behavior:** Upserts — updates token if same user+platform already registered

**Frontend integration (F4 — push notifications):**
```ts
// In App.tsx on startup after login:
import * as Notifications from 'expo-notifications';
const { status } = await Notifications.requestPermissionsAsync();
if (status === 'granted') {
  const token = await Notifications.getExpoPushTokenAsync();
  await api.post('/user/push-token', { token: token.data, platform: Platform.OS });
}
```

---

## Wallet — `/api/wallet`

All routes require auth.

### `GET /api/wallet`
**Returns:** `{ balance, currency }`

### `GET /api/wallet/transactions`
**Returns:** Array of wallet transactions `{ id, amount, type, source, description, created_at }`

**Frontend integration:** Wallet screen — show balance prominently, transactions as list below.

---

## Agent Routes — `/api/agent`

All routes require auth + `role = agent`.

### `GET /api/agent/me`
**Returns:** `{ profile: {..., is_online, base_lat, base_lng, referral_code}, kyc: {...} }`

### `POST /api/agent/kyc`
**Content-Type:** `multipart/form-data`
**Fields:** `doc_type` (optional), files (any field name)
**Returns:** `{ uploaded, verification_status: 'pending' }`

### `PATCH /api/agent/location`
**Body:** `{ "lat": 12.9716, "lng": 77.5946 }`
**Returns:** `{ success: true }`
**Must be called before going online for the first time.**

**Frontend integration (F5 — GPS):**
```ts
// On app foreground or before going online:
const loc = await Location.getCurrentPositionAsync({});
await api.patch('/agent/location', { lat: loc.coords.latitude, lng: loc.coords.longitude });
```

### `PATCH /api/agent/online`
**Body:** `{ "is_online": true|false }`
**Returns:** `{ is_online }`
**Errors:**
- `403` — agent not approved (KYC not done)
- `400 LOCATION_REQUIRED` — `base_lat` is NULL; call `/agent/location` first

**Frontend integration:**
Check for `details.code === 'LOCATION_REQUIRED'` → prompt user to enable location → call `/agent/location` → retry.

### `GET /api/agent/jobs/available`
**Returns:** `{ jobs: Booking[], meta: { distance_filter_applied, base_lat, base_lng, service_radius_km } }`
**Behavior:** Returns pending/confirmed bookings within agent's service radius. If no coordinates set, returns all available jobs with `distance_filter_applied: false`.

### `POST /api/agent/jobs/:id/accept`
**Returns:** `{ booking_id, status: 'assigned', agent_id }`
**Side effects:** Updates booking status → assigned; sends email + push `"Technician Assigned"` to customer

### `POST /api/agent/jobs/:id/reject`
**Returns:** `{ booking_id, status: 'rejected' }`

### `PATCH /api/agent/jobs/:id/status`
**Body:** `{ "status": "in_progress" | "completed" }`
**Returns:** `{ booking_id, status }`
**Allowed transitions:** `assigned → in_progress`, `in_progress → completed`

### `POST /api/agent/jobs/:bookingId/updates`
**Body:**
```json
{
  "update_type": "arrived|diagnosed|in_progress|completed|photo|note",
  "note": "optional text",
  "media_url": "optional https://..."
}
```
**Returns:** `{ success: true, update_id }`
**Side effects per type:**
- `arrived` → push notification `"Technician Arrived"` to customer
- `completed` → booking status set to `completed`, email + push `"Service Complete"` to customer

**Frontend integration (F3 — agent job screen):**
Each update type maps to a timeline step. Agent taps "I've Arrived" → POST `arrived`. Taps "Mark Complete" → POST `completed`.

### `GET /api/agent/earn/referral`
**Returns:** `{ referral_code }`

### `GET /api/agent/earn/summary`
**Returns:** Earnings summary with commission breakdown

### `GET /api/agent/earn/campaigns`
**Returns:** Active referral campaigns with tiers

### `GET /api/agent/earn/products`
**Returns:** Products with commission preview

### `GET /api/agent/earn/progress/:campaignId`
**Returns:** Agent's progress in a specific campaign

---

## Dealer Routes — `/api/dealer`

All routes require auth + `role = dealer`.

### `GET /api/dealer/me`
**Returns:** Dealer profile + KYC status

### `POST /api/dealer/kyc`
**Content-Type:** `multipart/form-data`
**Returns:** `{ uploaded, verification_status: 'pending' }`

### `PATCH /api/dealer/status`
**Body:** `{ "status": "string" }`

### `GET /api/dealer/pricing/products`
**Returns:** Products with dealer pricing

### `GET /api/dealer/pricing/:productId`
**Returns:** Pricing for a specific product

---

## Admin Routes — `/api/admin`

All routes require auth + `role = admin`.
Also accessible via web panel at `GET /admin` (serves `public/admin.html`).

### `GET /api/admin/kyc/agents`
**Returns:** Pending agents with profile + KYC documents merged

### `POST /api/admin/kyc/agents/:agentId/approve`
**Returns:** `{ message: "Agent approved" }`
**Side effects:** Sets `verification_status = 'approved'`

### `POST /api/admin/kyc/agents/:agentId/reject`
**Body:** `{ "review_notes": "reason (required)" }`
**Returns:** `{ message: "Agent rejected" }`

### `GET /api/admin/kyc/dealers`
### `POST /api/admin/kyc/dealers/:dealerId/approve`
### `POST /api/admin/kyc/dealers/:dealerId/reject`
Same pattern as agents.

### `GET /api/admin/users`
**Returns:** Paginated user list with roles

---

## Utils — `/api/utils`

No auth required.

### `GET /api/utils/geocode?lat=12.9716&lng=77.5946`
**Returns:** `{ address: "formatted address string", raw: { ...provider response } }`
**Behavior:**
- If `GOOGLE_MAPS_API_KEY` env var is set → uses Google Maps Geocoding API
- Otherwise → falls back to Nominatim (OpenStreetMap) with `User-Agent: AquaCare/1.0`

**Errors:** `400` invalid coords, `422` address not found, `503` provider unavailable

**Frontend integration (F5 — address autofill):**
```ts
const loc = await Location.getCurrentPositionAsync({});
const res = await api.get(`/utils/geocode?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`);
// Pre-fill address form fields with res.data.address
```

---

## Catalog / Services (pre-existing)

### `GET /api/services`
All available services (no auth)

### `GET /api/services/:id`
Single service detail

### `GET /api/products`
Lightweight product listing

---

## Push Notification Events Reference

The `data` payload in push notifications always includes `type` and `bookingId`:

| `type` | Trigger | Title | Body |
|--------|---------|-------|------|
| `booking_created` | Customer creates booking | "Booking Confirmed" | "Finding your technician..." |
| `agent_assigned` | Agent accepts job | "Technician Assigned" | "{agentName} is on the way" |
| `booking_update` | Agent posts `arrived` update | "Technician Arrived" | "Your technician is here" |
| `booking_completed` | Agent posts `completed` update | "Service Complete" | "Please rate your experience" |

**Frontend notification handler:**
```ts
Notifications.addNotificationResponseReceivedListener(response => {
  const { type, bookingId } = response.notification.request.content.data;
  switch (type) {
    case 'booking_created':
    case 'agent_assigned':
    case 'booking_update':
    case 'booking_completed':
      navigation.navigate('BookingDetail', { bookingId });
      break;
    case 'new_job':
      navigation.navigate('AgentJobDetail', { bookingId });
      break;
  }
});
```

---

## Environment Variables Required

```env
# Server
PORT=3000
NODE_ENV=production
BASE_SERVER_URL=https://yourdomain.com

# Database
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=

# Auth
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Payments
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# SMS (OTP)
FAST2SMS_API_KEY=

# Email
SENDGRID_API_KEY=
FROM_EMAIL=noreply@yourdomain.com

# Optional — geocode fallback to Nominatim if not set
GOOGLE_MAPS_API_KEY=
```

---

## Frontend Steps Remaining (F1–F5)

| Step | Screen | APIs Used |
|------|--------|-----------|
| F1 | OTP Login Screen | `POST /auth/send-otp` → `POST /auth/verify-otp` |
| F2 | Razorpay Payment Screen | `POST /payments/create-order` → Razorpay SDK → `POST /payments/verify` |
| F3 | Booking Detail + Agent Timeline | `GET /bookings/:id/updates` (poll/refresh on push) + `POST /agent/jobs/:id/updates` |
| F4 | Push Token Registration | `POST /user/push-token` on app startup after login |
| F5 | GPS + Address Autofill | `PATCH /agent/location` + `GET /utils/geocode` to prefill address form |
