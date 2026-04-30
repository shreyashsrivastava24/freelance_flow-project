# FreelanceFlow Backend API

## Local setup
1. Copy `.env.example` to `.env`.
2. Set `MONGO_URI` and `JWT_SECRET` in `.env`.
3. Run `npm install`.
4. Run `node index.js`.

## Deployment checklist
1. Deploy the `backend-api` directory to your hosting platform (e.g. Render).
2. Add `MONGO_URI` and `JWT_SECRET` in the Environment Variables.
3. Paste the MongoDB Atlas URI exactly as provided by Atlas. Do not wrap it in quotes.
4. Verify the deployment with `GET /api/health`.

## MongoDB Atlas checklist
1. In Atlas, open `Network Access`.
2. Add `0.0.0.0/0` for serverless/cloud deployments unless you have fixed egress IPs.
3. Confirm the database user has the correct username and password for the connection string.
4. Copy the driver connection string again if you see SRV or DNS errors such as `querySrv`.

## Runtime behavior
- Every `/api/*` request waits for `connectDB()` before route handlers run.
- Production requests fail with `503` when MongoDB is unavailable instead of hanging on buffered queries.
- `GET /api/health` reports whether the API can see a Mongo URI and whether Mongoose is connected.

## Endpoints
- `/api/auth/register` - Register
- `/api/auth/login` - Login
- `/api/clients` - Client CRUD
- `/api/projects` - Project CRUD
- `/api/tasks` - Task CRUD
- `/api/timelogs` - Time tracking
- `/api/invoices` - Invoice generation
- `/api/sample-data` - Load demo data
