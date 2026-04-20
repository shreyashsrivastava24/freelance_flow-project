# FreelanceFlow Backend API

## Setup
1. Copy `.env` and set your MongoDB URI as `MONGO_URI`.
2. Run `npm install` to install dependencies.
3. Run `node index.js` to start the server.

## Endpoints
- `/api/auth/register` — Register
- `/api/auth/login` — Login
- `/api/clients` — Client CRUD
- `/api/projects` — Project CRUD
- `/api/tasks` — Task CRUD
- `/api/timelogs` — Time tracking
- `/api/invoices` — Invoice generation
- `/api/sample-data` — Load demo data

## Notes
- All endpoints require authentication (except register/login).
- All data is scoped to the authenticated user (multi-tenancy).
- Invoice PDFs are saved in `/invoices`.
