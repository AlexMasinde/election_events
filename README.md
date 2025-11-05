# Events Backend API Documentation

## Base URL

**Production:** `https://plankton-app-2aw6t.ondigitalocean.app`

**Development:** `http://localhost:3000`

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Error Handling](#error-handling)
5. [Important Notes](#important-notes)

---

## Quick Start

### Base URL Configuration

Set your API base URL:

```
https://plankton-app-2aw6t.ondigitalocean.app
```

### Request Configuration

All requests must include:
- **Content-Type**: `application/json` (for POST/PUT requests)
- **Authorization**: `Bearer <accessToken>` (for authenticated endpoints)
- **Credentials**: `include` (required for http-only cookies)

---

## Authentication

### Overview

The API uses JWT authentication with:
- **Access Token**: Sent in `Authorization` header (expires in 15 minutes)
- **Refresh Token**: Stored as http-only cookie (expires in 7 days)

### Authentication Flow

1. User signs up or logs in → Receives `accessToken` in response
2. Store `accessToken` in memory/localStorage (not http-only cookie)
3. Include `accessToken` in `Authorization` header for all authenticated requests
4. When accessToken expires → Call `/api/auth/refresh` to get new token
5. Refresh token is automatically sent via http-only cookie

### Important Notes

- ⚠️ **Always include `credentials: 'include'`** in fetch/axios requests
- ⚠️ **Refresh tokens are http-only cookies** - automatically handled by browser
- ⚠️ **Access tokens expire in 15 minutes** - implement token refresh logic
- ⚠️ **All authenticated endpoints require `Authorization: Bearer <token>` header**

---

## API Endpoints

### Authentication

#### 1. Sign Up

**POST** `/api/auth/signup`

Create a new user account (defaults to "user" role).

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response (201):**
```json
{
  "message": "User created successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-here",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

**Error Responses:**
- **400**: `{"message": "Name, email, and password are required"}`
- **400**: `{"message": "User with this email already exists"}`

---

#### 2. Login

**POST** `/api/auth/login`

Login with email and password.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-here",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

**Error Responses:**
- **400**: `{"message": "Email and password are required"}`
- **401**: `{"message": "Invalid email or password"}`

---

#### 3. Refresh Token

**POST** `/api/auth/refresh`

Refresh the access token using the refresh token cookie.

**Request:** None (refresh token sent via cookie automatically)

**Headers:** Must include `credentials: 'include'` to send cookies

**Response (200):**
```json
{
  "message": "Token refreshed successfully",
  "accessToken": "new-token-here"
}
```

**Error Responses:**
- **401**: `{"message": "Refresh token not provided"}`
- **401**: `{"message": "Invalid refresh token"}`

---

#### 4. Logout

**POST** `/api/auth/logout`

Logout and clear refresh token.

**Headers:** `Authorization: Bearer <accessToken>`

**Request:** None

**Response (200):**
```json
{
  "message": "Logout successful"
}
```

---

### Events

#### 1. Create Event (Admin Only)

**POST** `/api/events`

Create a new event. **Requires admin role.**

**Headers:** 
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "eventName": "Nairobi Election Event 2024",
  "county": "NAIROBI CITY",
  "constituency": "EMBAKASI NORTH",
  "ward": "KARIOBANGI NORTH"
}
```

**Note:** 
- `eventName` and `county` are **required**
- `constituency` and `ward` are **optional**

**Response (201):**
```json
{
  "message": "Event created successfully",
  "event": {
    "eventId": "uuid-here",
    "eventName": "Nairobi Election Event 2024",
    "county": "NAIROBI CITY",
    "constituency": "EMBAKASI NORTH",
    "ward": "KARIOBANGI NORTH",
    "createdBy": "user-uuid",
    "createdAt": "2024-11-05T09:00:00.000Z"
  }
}
```

**Error Responses:**
- **400**: `{"message": "Event name and county are required"}`
- **403**: `{"message": "Admin access required"}`

---

#### 2. Get All Events

**GET** `/api/events`

Get all events. **Requires authentication.**

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200):**
```json
{
  "message": "Events retrieved successfully",
  "events": [
    {
      "eventId": "uuid-here",
      "eventName": "Nairobi Election Event 2024",
      "county": "NAIROBI CITY",
      "constituency": "EMBAKASI NORTH",
      "ward": "KARIOBANGI NORTH",
      "createdBy": {
        "id": "user-uuid",
        "name": "Admin User",
        "email": "admin@example.com"
      },
      "createdAt": "2024-11-05T09:00:00.000Z",
      "updatedAt": "2024-11-05T09:00:00.000Z"
    }
  ]
}
```

---

#### 3. Get Single Event

**GET** `/api/events/:eventId`

Get a specific event by ID. **Requires authentication.**

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200):**
```json
{
  "message": "Event retrieved successfully",
  "event": {
    "eventId": "uuid-here",
    "eventName": "Nairobi Election Event 2024",
    "county": "NAIROBI CITY",
    "constituency": "EMBAKASI NORTH",
    "ward": "KARIOBANGI NORTH",
    "createdBy": {
      "id": "user-uuid",
      "name": "Admin User",
      "email": "admin@example.com"
    },
    "createdAt": "2024-11-05T09:00:00.000Z",
    "updatedAt": "2024-11-05T09:00:00.000Z"
  }
}
```

**Error Responses:**
- **404**: `{"message": "Event not found"}`

---

### Participants

#### 1. Search Participant (Voter Lookup)

**POST** `/api/participants/search`

Search for a participant using voter lookup service. **Requires authentication.**

**Headers:** 
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "eventId": "uuid-here",
  "idNumber": "23057470"
}
```

**Response (200) - Found:**
```json
{
  "message": "Participant found",
  "participant": {
    "idNumber": "23057470",
    "name": "REGINAH WAMBUI",
    "dateOfBirth": "1983-06-18",
    "sex": "Female",
    "county": "NAIROBI CITY",
    "constituency": "EMBAKASI NORTH",
    "ward": "KARIOBANGI NORTH",
    "pollingCenter": "OUR LADY OF FATIMA SECONDARY"
  }
}
```

**Response (404) - Not Found:**
```json
{
  "message": "Participant not found"
}
```

**Error Responses:**
- **400**: `{"message": "Event ID and ID number are required"}`
- **404**: `{"message": "Event not found"}`

---

#### 2. Check-in Participant

**POST** `/api/participants/checkin`

Check-in a participant. **Requires authentication.**

**Headers:** 
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "eventId": "uuid-here",
  "idNumber": "23057470",
  "name": "REGINAH WAMBUI",
  "dateOfBirth": "1983-06-18",
  "sex": "Female",
  "county": "NAIROBI CITY",
  "constituency": "EMBAKASI NORTH",
  "ward": "KARIOBANGI NORTH",
  "pollingCenter": "OUR LADY OF FATIMA SECONDARY"
}
```

**Note:**
- **Required fields**: `eventId`, `idNumber`, `name`, `dateOfBirth`, `sex`
- **Optional fields**: `county`, `constituency`, `ward`, `pollingCenter`

**Response (201):**
```json
{
  "message": "Participant checked in successfully",
  "participant": {
    "id": "uuid-here",
    "idNumber": "23057470",
    "name": "REGINAH WAMBUI",
    "checkedIn": 1,
    "checkedInAt": "2024-11-05T09:00:00.000Z",
    "eventId": "uuid-here"
  }
}
```

**Error Responses:**
- **400**: `{"message": "Event ID, ID number, name, date of birth, and sex are required"}`
- **400**: `{"message": "Participant already checked in for this event"}`
- **404**: `{"message": "Event not found"}`

---

#### 3. Get Participants for Event

**GET** `/api/participants/event/:eventId`

Get all participants for a specific event. **Requires authentication.**

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200):**
```json
{
  "message": "Participants retrieved successfully",
  "participants": [
    {
      "id": "uuid-here",
      "idNumber": "23057470",
      "name": "REGINAH WAMBUI",
      "dateOfBirth": "1983-06-18",
      "sex": "Female",
      "county": "NAIROBI CITY",
      "constituency": "EMBAKASI NORTH",
      "ward": "KARIOBANGI NORTH",
      "pollingCenter": "OUR LADY OF FATIMA SECONDARY",
      "checkedIn": 1,
      "checkedInBy": {
        "id": "user-uuid",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "checkedInAt": "2024-11-05T09:00:00.000Z",
      "eventId": "uuid-here"
    }
  ]
}
```

**Note:** `checkedIn` is `1` (checked in) or `0` (not checked in)

**Error Responses:**
- **404**: `{"message": "Event not found"}`

---

### Health Check

#### GET `/health`

Check if the server is running.

**Request:** None

**Response (200):**
```json
{
  "status": "ok",
  "message": "Server is running"
}
```

---

## Error Handling

### Standard Error Response Format

All errors follow this format:
```json
{
  "message": "Error description here"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation errors, missing fields) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Internal Server Error |

### Common Error Messages

| Status | Message | Description |
|--------|---------|-------------|
| 400 | "Name, email, and password are required" | Missing required fields |
| 400 | "User with this email already exists" | Duplicate email |
| 400 | "Event name and county are required" | Missing required event fields |
| 400 | "Participant already checked in for this event" | Duplicate check-in |
| 401 | "No token provided" | Missing Authorization header |
| 401 | "Invalid token" | Expired or invalid access token |
| 401 | "Invalid email or password" | Wrong credentials |
| 403 | "Admin access required" | User is not admin |
| 404 | "Event not found" | Invalid event ID |
| 404 | "Participant not found" | Voter not found in lookup |

---

## Important Notes

### Security

1. **Always include `credentials: 'include'`** in fetch/axios requests to send cookies
2. **Store access tokens securely** (localStorage is acceptable for web apps)
3. **Never commit tokens** to version control
4. **Refresh tokens are http-only** - cannot be accessed via JavaScript

### Token Management

1. **Access tokens expire in 15 minutes** - implement token refresh logic
2. **Refresh tokens expire in 7 days** - user needs to login again
3. **Handle 401 errors** - automatically refresh token and retry request
4. **Store access token** in memory or localStorage after login/signup

### Check-in Flow

1. **Search first** - Always search for participant before checking in
2. **Use data from search** - Use participant data returned from search response
3. **Handle duplicates** - Check if participant already checked in (returns 400)
4. **Show feedback** - Inform user of success/failure

### CORS Configuration

- The API is configured to accept requests from your frontend domain
- Ensure `credentials: 'include'` is set in all requests
- The API will automatically handle CORS for configured origins

### User Roles

- **user**: Regular user (default for signup)
- **admin**: Admin user (must be created via SQL)

Only admin users can create events.

---

## Quick Reference

### Base URL
```
https://plankton-app-2aw6t.ondigitalocean.app
```

### Authentication Endpoints
- **Signup**: `POST /api/auth/signup`
- **Login**: `POST /api/auth/login`
- **Refresh**: `POST /api/auth/refresh`
- **Logout**: `POST /api/auth/logout`

### Events Endpoints
- **Get All**: `GET /api/events`
- **Get One**: `GET /api/events/:eventId`
- **Create**: `POST /api/events` (Admin only)

### Participants Endpoints
- **Search**: `POST /api/participants/search`
- **Check-in**: `POST /api/participants/checkin`
- **Get by Event**: `GET /api/participants/event/:eventId`

### Health Check
- **Check**: `GET /health`

---

## Request Headers

### For All Requests
```
Content-Type: application/json
credentials: include  (for cookies)
```

### For Authenticated Requests
```
Authorization: Bearer <accessToken>
Content-Type: application/json
credentials: include
```

---

## Response Format

### Success Response
```json
{
  "message": "Success message",
  "data": { ... }
}
```

### Error Response
```json
{
  "message": "Error message"
}
```

---

## Support

For issues or questions:
- Check error messages in API responses
- Review logs in DigitalOcean dashboard
- Verify environment variables are set correctly
- Ensure SSL certificates are configured for production database

---

## Backend Technical Details

- **Framework**: Express.js with TypeScript
- **Database**: MySQL (DigitalOcean Managed Database)
- **ORM**: TypeORM
- **Authentication**: JWT with http-only cookies
- **Logging**: Winston
- **Security**: Helmet middleware
- **Environment**: Production-ready with validation

