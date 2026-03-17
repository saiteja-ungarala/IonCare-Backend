# Disabled Third-Party API Calls
**Reason:** Razorpay, Fast2SMS, and SendGrid keys are not yet configured.
All original code is preserved — only commented out. Nothing was deleted.
Re-enable each section by uncommenting when the real key is added to the environment.

---

## File 1 — `src/config/env.ts`

### What changed
The following six keys were changed from `getRequiredEnv(...)` (throws on startup
if missing) to `getOptionalEnv(...)` (returns `''` if missing).

A new helper `getOptionalEnv` was added right below `getRequiredEnv`:
```ts
const getOptionalEnv = (key: string): string => {
    return process.env[key] ?? '';
};
```

### Keys made optional
| Key | Was | Now |
|-----|-----|-----|
| `RAZORPAY_KEY_ID` | `getRequiredEnv(...)` | `getOptionalEnv(...)` |
| `RAZORPAY_KEY_SECRET` | `getRequiredEnv(...)` | `getOptionalEnv(...)` |
| `RAZORPAY_WEBHOOK_SECRET` | `getRequiredEnv(...)` | `getOptionalEnv(...)` |
| `FAST2SMS_API_KEY` | `getRequiredEnv(...)` | `getOptionalEnv(...)` |
| `SENDGRID_API_KEY` | `getRequiredEnv(...)` | `getOptionalEnv(...)` |
| `FROM_EMAIL` | `getRequiredEnv(...)` | `getOptionalEnv(...)` |

### How to re-enable
Set each key in the container/hosting platform environment variables.
No code change needed — `getOptionalEnv` returns the real value once the env var is set.

---

## File 2 — `src/services/payment.service.ts`

### What changed
Three blocks of code were commented out. Nothing was deleted.

#### 1. Razorpay import (line 1)
```ts
// import Razorpay from 'razorpay';  // DISABLED
```

#### 2. Razorpay instance creation (lines 5–8)
```ts
// const razorpay = new Razorpay({
//     key_id: env.RAZORPAY_KEY_ID,
//     key_secret: env.RAZORPAY_KEY_SECRET,
// });
```

#### 3. `createOrder` — razorpay.orders.create call
Original:
```ts
const order = await razorpay.orders.create({ amount: Math.round(amount * 100), currency, receipt });
return { id: order.id, amount: order.amount as number, currency: order.currency };
```
Replaced with stub return so TypeScript compiles and the rest of the app doesn't crash:
```ts
// DISABLED — razorpay.orders.create commented out
console.warn('[PaymentService] Razorpay disabled — returning stub order');
return { id: `DISABLED_${receipt}`, amount, currency };
```

#### 4. `verifySignature` — HMAC computation
Original:
```ts
const computed = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(...).digest('hex');
return computed === signature;
```
Replaced with:
```ts
// DISABLED
console.warn('[PaymentService] Razorpay disabled — signature verification skipped');
return false;
```

#### 5. `verifyWebhookSignature` — webhook HMAC computation
Same pattern as above — commented out, returns `false`.

### How to re-enable
1. Uncomment `import Razorpay from 'razorpay'`
2. Uncomment the `const razorpay = new Razorpay(...)` block
3. In `createOrder`: uncomment the `razorpay.orders.create(...)` block and its return; remove the stub return
4. In `verifySignature`: uncomment the HMAC block and its return; remove the stub return
5. In `verifyWebhookSignature`: same as above

---

## File 3 — `src/services/sms.service.ts`

### What changed
The entire `fetch` call to Fast2SMS inside `sendOTP` was commented out.

Original:
```ts
const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { 'authorization': env.FAST2SMS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ variables_values: otp, route: 'otp', numbers: phone }),
});
if (!response.ok) {
    throw { type: 'AppError', message: 'Failed to send OTP. Please try again.', statusCode: 502 };
}
```

Replaced with:
```ts
// DISABLED — Fast2SMS fetch commented out
console.warn(`[SmsService] Fast2SMS disabled — OTP for ${phone}: ${otp}`);
```

**Effect:** OTP login flow still works end-to-end. The OTP is printed to the server
console log instead of being sent via SMS. Useful for testing.

### How to re-enable
Uncomment the full `fetch` block and the `if (!response.ok)` block, and remove the `console.warn` line.

---

## File 4 — `src/services/email.service.ts`

### What changed
Five blocks were commented out. Nothing was deleted.

#### 1. `sgMail.setApiKey(...)` (line 4)
```ts
// DISABLED
// sgMail.setApiKey(env.SENDGRID_API_KEY);
```

#### 2. `sendPasswordReset` — sgMail.send call
Entire `sgMail.send({...}).catch(...)` block commented out.
Replaced with:
```ts
console.warn(`[EmailService] SendGrid disabled — password reset link for ${to}: ${resetLink}`);
```

#### 3. `sendBookingConfirmation` — sgMail.send call
Same pattern — commented out, replaced with console.warn.

#### 4. `sendBookingAssigned` — sgMail.send call
Same pattern — commented out, replaced with console.warn.

#### 5. `sendBookingCompleted` — sgMail.send call
Same pattern — commented out, replaced with console.warn.

### How to re-enable
1. Uncomment `sgMail.setApiKey(env.SENDGRID_API_KEY)`
2. In each of the four methods: uncomment the `sgMail.send({...}).catch(...)` block
   and remove the `console.warn` line

---

## Summary

| File | Change | Original code |
|------|--------|---------------|
| `src/config/env.ts` | 6 keys made optional | `getRequiredEnv` → `getOptionalEnv` |
| `src/services/payment.service.ts` | Razorpay import + instance + 3 method bodies commented out | `new Razorpay(...)`, `razorpay.orders.create(...)`, HMAC verifications |
| `src/services/sms.service.ts` | Fast2SMS fetch call commented out | `fetch('https://www.fast2sms.com/...')` |
| `src/services/email.service.ts` | SendGrid setup + 4 send calls commented out | `sgMail.setApiKey(...)`, 4× `sgMail.send(...)` |

## What still works after these changes
- Server starts without crashing
- All auth flows (signup, login, JWT, refresh, logout)
- All booking flows
- All order flows
- All wallet flows
- All dealer/agent/admin flows
- OTP is generated and printed to server logs (not sent via SMS)
- Password reset link is printed to server logs (not sent via email)
- Payment endpoints respond but return a disabled stub (no real Razorpay transaction)

## What does NOT work until keys are added
- Real SMS OTP delivery to user phones
- Real email delivery (booking confirmations, password reset emails)
- Real Razorpay payment processing
