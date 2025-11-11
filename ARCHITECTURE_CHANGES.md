# Architecture Changes Summary

## Overview
This document outlines the architectural changes made to support:
1. Multiple check-ins per participant per event (different days)
2. Same-day duplicate prevention
3. Admin-user relationship for event access control
4. Date-based reporting capabilities

## Changes Made

### 1. New Entity: CheckInLog
**File:** `src/entities/CheckInLog.ts`

Tracks individual check-ins with:
- `participantId`: Links to participant
- `eventId`: Links to event
- `checkedInById`: User who performed the check-in
- `checkInDate`: Date of check-in (for reporting)
- `checkedInAt`: Full timestamp

**Key Features:**
- Unique constraint on `(participantId, eventId, checkInDate)` to prevent same-day duplicates
- Cascade delete when participant/event/user is deleted

### 2. Updated Entity: User
**File:** `src/entities/User.ts`

Added:
- `adminId`: Foreign key to admin user (nullable)
- `admin`: Relationship to admin user
- `users`: One-to-many relationship to users assigned to this admin

**Usage:**
- Admins: `adminId = null`
- Users: `adminId = <admin's user id>`

### 3. Updated Entity: Participant
**File:** `src/entities/Participant.ts`

**Removed:**
- `checkedIn` (smallint)
- `checkedInById` (uuid)
- `checkedInAt` (timestamp)

**Added:**
- `checkInLogs`: One-to-many relationship to CheckInLog

**Note:** Participant now stores only participant information. Check-in history is tracked in CheckInLog.

### 4. Updated Entity: Event
**File:** `src/entities/Event.ts`

**Added:**
- `checkInLogs`: One-to-many relationship to CheckInLog

### 5. Updated Routes: Participants
**File:** `src/routes/participants.ts`

#### Changes:
1. **Event Access Control**: Added `checkEventAccess()` helper function
   - Admins: Can only access events they created
   - Users: Can only access events created by their admin

2. **Search Route** (`POST /api/participants/search`):
   - Added event access check

3. **Check-in Route** (`POST /api/participants/checkin`):
   - Creates/updates Participant record
   - Creates CheckInLog entry for each check-in
   - Prevents same-day duplicate check-ins
   - Returns check-in log information

4. **Get Participants Route** (`GET /api/participants/event/:eventId`):
   - Returns participants with all check-in logs
   - Includes `totalCheckIns` count
   - Each check-in log includes who checked them in and when

5. **New Route: Get Participants by Date** (`GET /api/participants/event/:eventId/date/:date`):
   - Returns all participants checked in on a specific date
   - Format: `YYYY-MM-DD`
   - Perfect for date-based reporting

### 6. Updated Routes: Events
**File:** `src/routes/events.ts`

#### Changes:
1. **Get All Events** (`GET /api/events`):
   - **Admins**: See only events they created
   - **Users**: See only events created by their admin
   - Returns 403 if user is not assigned to an admin

2. **Get Single Event** (`GET /api/events/:eventId`):
   - Added access control check
   - Admins can only access their own events
   - Users can only access events from their admin

## Database Migration

**File:** `migrations/add_checkin_logs_and_admin_relationship.sql`

Run this migration to:
1. Create `check_in_logs` table
2. Add `adminId` column to `users` table
3. Create necessary indexes

**Note:** If `synchronize: true` is enabled in TypeORM config, tables will be created automatically. For production, disable synchronize and use migrations.

## API Changes

### Check-in Response Format
**Before:**
```json
{
  "message": "Participant checked in successfully",
  "participant": {
    "id": "...",
    "checkedIn": 1,
    "checkedInAt": "..."
  }
}
```

**After:**
```json
{
  "message": "Participant checked in successfully",
  "checkIn": {
    "id": "...",
    "participantId": "...",
    "eventId": "...",
    "checkInDate": "2024-11-05",
    "checkedInAt": "2024-11-05T09:00:00.000Z"
  },
  "participant": {
    "id": "...",
    "idNumber": "...",
    "name": "..."
  }
}
```

### Get Participants Response
**New Fields:**
- `checkInLogs`: Array of all check-ins with dates and who checked them in
- `totalCheckIns`: Total number of check-ins

### New Endpoint
**GET** `/api/participants/event/:eventId/date/:date`

Returns participants checked in on a specific date for reporting.

## Access Control Rules

### Admins
- Can create events
- Can only see events they created
- Can check in participants to their events only

### Users
- Cannot create events
- Can only see events created by their admin
- Can check in participants to their admin's events only
- Must have `adminId` set (returns 403 if not assigned)

## Check-in Behavior

1. **Same Participant, Different Days**: ✅ Allowed
   - Participant can check in on Day 1, Day 2, Day 3, etc.
   - Each check-in creates a new CheckInLog entry

2. **Same Participant, Same Day**: ❌ Blocked
   - Returns 400: "Participant already checked in today"
   - Unique constraint prevents duplicates

3. **Participant Info Updates**: ✅ Handled
   - If participant exists, their info is updated
   - Check-in log is still created separately

## Reporting Capabilities

### By Event
- `GET /api/participants/event/:eventId`: All participants with all check-ins

### By Date
- `GET /api/participants/event/:eventId/date/:date`: Participants checked in on specific date

### Data Available
- Who checked in each participant (checkedInBy)
- When they checked in (checkInDate, checkedInAt)
- Total check-ins per participant
- Full check-in history

## Migration Steps

1. **Backup Database**: Always backup before migration

2. **Run Migration SQL**: Execute `migrations/add_checkin_logs_and_admin_relationship.sql`

3. **Update Application Code**: Deploy updated code

4. **Assign Users to Admins**: Update `users.adminId` for regular users

5. **Test**: Verify check-ins work correctly and access control is enforced

## Breaking Changes

⚠️ **Important**: The check-in response format has changed. Frontend applications need to be updated to handle the new response structure.

## Notes

- TypeORM `synchronize: true` will auto-create tables in development
- For production, disable synchronize and use migrations
- Old `checkedIn`, `checkedInById`, `checkedInAt` fields can be removed from `participants` table after migration (optional)

