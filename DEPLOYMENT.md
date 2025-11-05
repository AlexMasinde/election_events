# DigitalOcean App Platform Deployment Guide

## Prerequisites

1. DigitalOcean account
2. App Platform access
3. Managed MySQL database (or existing database with SSL)

## Dockerfile Features

- **Multi-stage build**: Smaller production image
- **Security**: Runs as non-root user
- **Health check**: Built-in health monitoring
- **Production dependencies**: Only installs production packages
- **Optimized**: Uses Alpine Linux for smaller image size

## Deployment Steps

### 1. Build and Test Locally (Optional)

```bash
# Build the Docker image
docker build -t events-backend .

# Run locally to test
docker run -p 3000:3000 \
  -e DB_HOST=your-db-host \
  -e DB_PORT=25060 \
  -e DB_USERNAME=your-username \
  -e DB_PASSWORD=your-password \
  -e DB_DATABASE=election_events \
  -e DB_SSL=true \
  -e DB_SSL_CA="your-ca-certificate" \
  -e JWT_SECRET="your-32-char-secret" \
  -e VOTER_LOOKUP_API_URL="https://..." \
  -e VOTER_LOOKUP_API_TOKEN="your-token" \
  -e NODE_ENV=production \
  events-backend
```

### 2. Push to GitHub/GitLab

Ensure your code is pushed to a repository:
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 3. Deploy to DigitalOcean App Platform

1. Go to DigitalOcean Dashboard → Apps
2. Click "Create App"
3. Connect your repository
4. Configure build settings:
   - **Build Command**: `npm run build`
   - **Run Command**: `node dist/index.js`
   - Or use the Dockerfile (DigitalOcean will detect it automatically)

### 4. Environment Variables

Set these in DigitalOcean App Platform:

#### Required Variables
```
DB_HOST=<your-db-host>
DB_PORT=25060
DB_USERNAME=<your-username>
DB_PASSWORD=<your-password>
DB_DATABASE=election_events
DB_SSL=true
DB_SSL_CA=<digitalocean-ca-certificate>
DB_CONNECTION_LIMIT=20
JWT_SECRET=<generate-32-char-secret>
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
VOTER_LOOKUP_API_URL=https://backend.machinenova.com/api/method/election_management.api.get_voter_information
VOTER_LOOKUP_API_TOKEN=<your-token>
NODE_ENV=production
PORT=3000
FRONTEND_URL=<your-frontend-url>
```

#### Getting DigitalOcean CA Certificate

1. Go to your Managed Database in DigitalOcean
2. Click "Connection Details"
3. Download or copy the CA certificate
4. Paste it into `DB_SSL_CA` (can use `\n` for line breaks)

### 5. Database Connection

If using DigitalOcean Managed Database:
- The database will automatically be available via internal network
- Use the connection details from the database dashboard
- Ensure SSL is enabled (`DB_SSL=true`)
- Add the CA certificate to `DB_SSL_CA`

### 6. Health Check

The Dockerfile includes a health check endpoint:
- Endpoint: `/health`
- Interval: 30 seconds
- Timeout: 3 seconds
- Start period: 40 seconds
- Retries: 3

DigitalOcean App Platform will automatically use this for monitoring.

### 7. Logs

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only

View logs in DigitalOcean App Platform dashboard under "Runtime Logs".

## Build Optimization

The Dockerfile uses:
- **Multi-stage build**: Reduces final image size
- **Alpine Linux**: Smaller base image (~50MB vs ~200MB)
- **Production dependencies only**: Excludes dev dependencies
- **Layer caching**: Optimized for faster rebuilds

## Troubleshooting

### Build Fails
- Check TypeScript compilation: `npm run build`
- Verify all dependencies are in `package.json`
- Check `tsconfig.json` is correct

### Database Connection Fails
- Verify `DB_SSL=true` for managed databases
- Check `DB_SSL_CA` contains valid certificate
- Ensure database firewall allows App Platform IPs
- Verify connection credentials

### App Won't Start
- Check logs in DigitalOcean dashboard
- Verify all required environment variables are set
- Check `PORT` environment variable (should be set automatically by App Platform)
- Verify `NODE_ENV=production`

### Health Check Fails
- Ensure `/health` endpoint is accessible
- Check server is listening on correct port
- Verify no firewall blocking port

## Post-Deployment

1. Test all endpoints
2. Monitor logs for errors
3. Set up database backups
4. Configure monitoring alerts
5. Set up log rotation (if needed)

## Image Size

Expected image size: ~150-200MB (with production dependencies only)

## Security Notes

- Runs as non-root user (nodejs:1001)
- Only production dependencies included
- Health check endpoint for monitoring
- SSL/TLS for database connections
- Environment variables for sensitive data

