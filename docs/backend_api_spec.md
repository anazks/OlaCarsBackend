# Ola Cars Voice Agent — Backend API Specification

**For:** Backend Development Team  
**Purpose:** All endpoints required by the ElevenLabs voice agent  
**Base URL:** `https://yourdomain.com/api/voice`  
**Auth:** All endpoints must validate a shared secret header `x-voice-agent-secret` —
--> pick a secret string. Something like:
  voice-agent-secret-ola2026
  
 --> In the backend .env file → VOICE_AGENT_SECRET=voice-agent-secret-ola2026. The backend reads this and checks every incoming
  request.
  
    // middleware/voiceAgentAuth.js

  const voiceAgentAuth = (req, res, next) => {
    const secret = req.headers['x-voice-agent-secret'];

    if (!secret || secret !== process.env.VOICE_AGENT_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    next();
  };

  module.exports = voiceAgentAuth;

  Then they attach it to the voice routes:

  // routes/voiceRoutes.js

  const voiceAgentAuth = require('../middleware/voiceAgentAuth');

  router.post('/initiate', voiceAgentAuth, initiateCall);
  router.get('/vehicles/available', voiceAgentAuth, getAvailableVehicles);
  router.get('/lease-schemes', voiceAgentAuth, getLeaseSchemes);

---

## Overview

The voice agent (Sofía) is hosted on ElevenLabs. It connects to the backend in two ways:

1. **Initiation Webhook** — fires before every call starts. ElevenLabs sends the caller's phone number, backend responds with customer data. This is how the agent knows if the caller is new or existing before saying a word.
2. **Server Tools** — HTTP calls made mid-conversation when the agent needs data or needs to take an action (check account, create lead, book vehicle, log call).

```
Inbound call arrives
  → ElevenLabs hits POST /api/voice/initiate (before call starts)
  → Backend returns customer data (or "new customer")
  → Agent greets caller by name (if existing) or generically (if new)
  → Conversation starts
  → Agent calls Server Tool endpoints as needed during conversation
  → Call ends → ElevenLabs hits POST /api/voice/log-call
```

---

## 1. Initiation Webhook

### `POST /api/voice/initiate`

**When:** Automatically called by ElevenLabs before every inbound call starts.  
**Purpose:** Identify the caller and inject their data into the agent's context before the conversation begins.

**Request from ElevenLabs:**
```json
{
  "caller_id": "+50712345678",
  "agent_id": "your_elevenlabs_agent_id",
  "call_id": "call_abc123"
}
```

**Your Response (must match this exact format):**

If the customer EXISTS in the system:
```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "is_existing_customer": "true",
    "customer_id": "64a1f2c3d4e5f6a7b8c9d0e1",
    "customer_name": "Juan Pérez",
    "customer_phone": "+50712345678",
    "customer_status": "ACTIVE"
  }
}
```

If the customer does NOT exist in the system:
```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "is_existing_customer": "false",
    "customer_id": "",
    "customer_name": "",
    "customer_phone": "+50712345678",
    "customer_status": ""
  }
}
```

**Backend logic:**
1. Extract `caller_id` from the request body
2. Query `DriverModel` where `phone == caller_id`
3. If found — return existing customer data
4. If not found — return the "new customer" response with empty fields
5. Always return HTTP 200 — never return 404 here, ElevenLabs will error

**Notes:**
- `customer_phone` should always be returned even for new customers — the agent uses it later for lead creation and booking
- `customer_status` values: `ACTIVE`, `INACTIVE`, `DRAFT`
- Response must always include `"type": "conversation_initiation_client_data"` — ElevenLabs requires this exactly

---

## 2. Server Tools (Mid-Conversation)

These are called by the agent during the conversation. ElevenLabs makes HTTP POST or GET requests to these URLs based on what the agent decides to do.

---

### `GET /api/voice/vehicles/available`

**When:** Customer asks "what cars do you have?" or "what's available?"  
**Purpose:** Return all currently available vehicles for the agent to describe.

**Request:** No body — simple GET

**Response:**
```json
{
  "success": true,
  "vehicles": [
    {
      "id": "64a1f2c3d4e5f6a7b8c9d0e1",
      "make": "Toyota",
      "model": "Corolla",
      "year": 2022,
      "category": "Sedan",
      "fuelType": "Gasolina",
      "transmission": "Automático",
      "colour": "Blanco",
      "seats": 5,
      "weeklyRent": 150,
      "monthlyRent": 600,
      "branch": "Panama City"
    }
  ]
}
```

**Notes:**
- Only return vehicles with status `ACTIVE — AVAILABLE`
- Keep the response flat and simple — the agent reads this aloud
- This may proxy or reuse the existing `GET /api/ai-service/vehicles/available` internally

---

### `GET /api/voice/lease-schemes`

**When:** Customer asks "what are the payment plans?" or "how much does it cost?"  
**Purpose:** Return available lease/pricing tiers so the agent can explain options clearly.

**Request:** No body — simple GET

**Response:**
```json
{
  "success": true,
  "schemes": [
    {
      "category": "Sedan",
      "weeklyRent": 150,
      "durationWeeks": 52,
      "totalCost": 7800,
      "monthlyEquivalent": 600,
      "maintenanceIncluded": true
    },
    {
      "category": "SUV",
      "weeklyRent": 200,
      "durationWeeks": 52,
      "totalCost": 10400,
      "monthlyEquivalent": 800,
      "maintenanceIncluded": true
    }
  ]
}
```

**Notes:**
- Aggregate pricing from existing vehicle records by category, or build a static `LeaseScheme` model — either works
- `maintenanceIncluded` should always be returned — it's a key selling point the agent mentions

---

### `GET /api/voice/account-status/:customerId`

**When:** Existing customer asks about their payments or pending dues.  
**Purpose:** Return the customer's pending payment information.

**Request:** `customerId` is passed as a URL parameter — the agent gets this from the initiation webhook response.

**Response:**
```json
{
  "success": true,
  "customer_name": "Juan Pérez",
  "pending_weeks": [
    {
      "week_number": 12,
      "amount_due": 150,
      "due_date": "2026-05-18",
      "status": "PENDING"
    },
    {
      "week_number": 13,
      "amount_due": 150,
      "due_date": "2026-05-25",
      "status": "PARTIAL"
    }
  ],
  "total_due": 300,
  "next_due_date": "2026-05-18"
}
```

If no pending payments:
```json
{
  "success": true,
  "customer_name": "Juan Pérez",
  "pending_weeks": [],
  "total_due": 0,
  "next_due_date": null
}
```

**Backend logic:**
1. Query `DriverModel` by `customerId`
2. Filter `rentTracking` array where `status` is `PENDING` or `PARTIAL`
3. Return sorted by `due_date` ascending

---

### `POST /api/voice/leads`

**When:** New customer shows interest but hasn't selected a specific vehicle yet.  
**Purpose:** Save the lead so the sales team can follow up.

**Request body:**
```json
{
  "name": "Carlos Mendoza",
  "phone": "+50712345678",
  "interest": "Sedan con pagos semanales",
  "source": "VOICE_AGENT",
  "notes": "Interesado en vehículos disponibles, quiere más información sobre planes"
}
```

**Response:**
```json
{
  "success": true,
  "lead_id": "64a1f2c3d4e5f6a7b8c9d0e1",
  "message": "Lead created successfully"
}
```

**Notes:**
- `phone` is passed by the agent from the `customer_phone` variable received at call initiation
- `source` must always be `"VOICE_AGENT"` — helps the sales team filter and prioritize
- Create a `Lead` model if one doesn't exist: `{ name, phone, interest, source, notes, createdAt }`

---

### `POST /api/voice/book-vehicle`

**When:** New customer is ready to pre-book a specific vehicle.  
**Purpose:** Create a DRAFT driver profile and mark the vehicle as PRE-BOOKED.

**Request body:**
```json
{
  "phone": "+50712345678",
  "vehicle_id": "64a1f2c3d4e5f6a7b8c9d0e1",
  "customer_name": "Carlos Mendoza"
}
```

**Response:**
```json
{
  "success": true,
  "booking_id": "64a1f2c3d4e5f6a7b8c9d0e2",
  "message": "Vehicle pre-booked successfully"
}
```

**Notes:**
- This may proxy the existing `POST /api/ai-service/vehicles/book` internally
- If driver doesn't exist, create a DRAFT driver profile automatically
- Update vehicle status to `PRE-BOOKED`

---

### `POST /api/voice/log-call`

**When:** At the end of every call, without exception.  
**Purpose:** Store the call outcome for the team to review and act on.

**Request body:**
```json
{
  "call_id": "call_abc123",
  "customer_phone": "+50712345678",
  "customer_id": "64a1f2c3d4e5f6a7b8c9d0e1",
  "is_existing_customer": true,
  "intent": "account_status",
  "outcome": "resolved",
  "summary": "Customer asked about pending payment. Informed of $300 due across 2 weeks. Customer acknowledged.",
  "duration_seconds": 145,
  "timestamp": "2026-05-11T10:30:00Z"
}
```

**Intent values the agent will send:**
| Value | Meaning |
|---|---|
| `vehicle_inquiry` | Asked about available cars |
| `lease_inquiry` | Asked about pricing/plans |
| `lead_captured` | New customer — interest recorded |
| `vehicle_booked` | New customer — vehicle pre-booked |
| `account_status` | Existing customer — checked payments |
| `general_support` | General question answered |
| `needs_follow_up` | Could not resolve — team must call back |

**Outcome values the agent will send:**
| Value | Meaning |
|---|---|
| `resolved` | Issue handled successfully |
| `lead_captured` | Lead saved, team to follow up |
| `booking_created` | Vehicle pre-booked |
| `pending` | Needs team follow-up |

**Response:**
```json
{
  "success": true,
  "log_id": "64a1f2c3d4e5f6a7b8c9d0e3"
}
```

**Notes:**
- Create a `CallLog` model: `{ call_id, customer_phone, customer_id, is_existing_customer, intent, outcome, summary, duration_seconds, timestamp }`
- When `intent` is `needs_follow_up`, trigger a notification or flag for the sales/ops team
- `customer_id` may be empty string for new customers — handle gracefully

---

## Summary — Endpoints to Build

| Method | Endpoint | Priority | Used by |
|---|---|---|---|
| POST | `/api/voice/initiate` | Critical | ElevenLabs — before every call |
| GET | `/api/voice/vehicles/available` | High | Agent Server Tool |
| GET | `/api/voice/lease-schemes` | High | Agent Server Tool |
| GET | `/api/voice/account-status/:customerId` | High | Agent Server Tool |
| POST | `/api/voice/leads` | High | Agent Server Tool |
| POST | `/api/voice/book-vehicle` | Medium | Agent Server Tool |
| POST | `/api/voice/log-call` | High | Agent Server Tool |

---

## Authentication

All requests from ElevenLabs will include this header:
```
x-voice-agent-secret: <shared_secret>
```

The backend must validate this on every endpoint and return `401` if it doesn't match.  
The shared secret is set in the ElevenLabs dashboard under Server Tool headers and must match an env variable on the backend (`VOICE_AGENT_SECRET`).

---

## Error Responses

All endpoints should return errors in this format:
```json
{
  "success": false,
  "error": "Brief description of what went wrong"
}
```

**Exception:** `POST /api/voice/initiate` must always return HTTP 200 even if the customer is not found — use the "new customer" response format instead of an error.

---

## Notes for the Backend Team

- All endpoints live under `/api/voice/` — keep them in a dedicated router file
- The `POST /api/voice/initiate` endpoint is the most critical — get this right first
- The `GET /api/voice/vehicles/available` may reuse the existing AI service endpoint internally
- The `POST /api/voice/book-vehicle` may reuse the existing `POST /api/ai-service/vehicles/book` internally
- Test each endpoint independently before registering it in ElevenLabs
- Once an endpoint URL is ready, share it with the voice agent team to register as a Server Tool
