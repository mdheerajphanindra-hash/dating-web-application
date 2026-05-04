# CampusMatch Dating App

A full-stack college-project dating app MVP built with:

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB
- Auth: JWT + bcrypt
- Real-time updates: Socket.IO

## Features Included

### User features
- Signup with email or phone
- Login and logout
- OTP verification after signup
- Forgot password with reset OTP
- Profile setup and editing
- Interests, photos, bio, education, and job fields
- Swipe right to like and left to skip
- Mutual like creates a match automatically
- Search filters by age, location, interest, and gender
- Match list
- People who liked you
- Sent likes list
- Chat for matched users only
- Seen status
- Delete message
- Block user
- Report user
- Privacy settings
- Change password
- Delete account
- Verification submission
- Notification summary for likes, matches, and unread messages

### Admin features
- Admin login using the regular auth flow
- Dashboard with total users, matches, reports, and active users
- Users list
- Block or unblock users from discovery
- Remove fake accounts
- Reports list with review and resolve actions

## Default Admin Account

The backend seeds an admin automatically if no admin exists:

- Email: `admin@datingapp.local`
- Password: `Admin@123`

You can override these with:

- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

## Setup

### 1. Backend

Create `backend/.env`:

```env
MONGO_URI=mongodb://localhost:27017/datingApp
JWT_SECRET=supersecretkey
DEFAULT_ADMIN_EMAIL=admin@datingapp.local
DEFAULT_ADMIN_PASSWORD=Admin@123
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM=CampusMatch <your-email@gmail.com>
```

Install and run:

```bash
cd backend
npm install
npm run dev
```

### 2. Frontend

Optional `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

Install and run:

```bash
cd frontend
npm install
npm run dev
```

## Reset Password Email

If `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are configured, forgot-password sends the reset code to the user's email address.

For Gmail, use an App Password instead of your normal Gmail password.

## Demo OTP Behavior

For local testing, signup OTP is returned in the API response. Reset OTP is also returned when SMTP is not configured, so the flow still works without email integration.

## Important Notes

- MongoDB must be running before starting the backend.
- The app uses direct image URLs for profile photos in this MVP.
- Socket.IO is used for live match and chat update notifications.
