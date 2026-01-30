# Supabase Storage Monitoring

## Overview

This document describes the database storage monitoring system that sends Telegram notifications when Supabase storage limits are approaching.

## Features

- **Automatic Monitoring**: Checks database size during health checks
- **Telegram Alerts**: Sends notifications when thresholds are exceeded
- **Early Warning**: 80% warning threshold for proactive planning
- **Critical Alert**: 90% critical threshold for immediate action
- **Top Tables Breakdown**: Shows largest tables for cleanup guidance
- **Cooldown Protection**: Prevents spam (1 hour between alerts)

## Configuration

Add these environment variables to your `.env` or `.env.local` file:

```bash
# Supabase Storage Monitoring
SUPABASE_PLAN_LIMIT_GB=8              # Default: 8GB (Pro plan)
DB_SIZE_WARNING_THRESHOLD=0.8         # 80% (6.4GB)
DB_SIZE_CRITICAL_THRESHOLD=0.9        # 90% (7.2GB)

# Telegram Notifications (required)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
ENABLE_TELEGRAM_NOTIFICATIONS=true    # Must be "true" for production
NODE_ENV=production                    # Must be "production"
```

## How It Works

1. **Health Check Integration**: Database size check runs automatically during `performHealthCheck()`
2. **Threshold Checking**: 
   - **Warning (80%)**: Sends warning alert with recommendations
   - **Critical (90%)**: Sends critical alert requiring immediate action
3. **Cooldown**: Each alert type has 1-hour cooldown to prevent spam
4. **Top Tables**: Shows 5 largest tables to help identify cleanup targets

## Alert Messages

### Warning Alert (80%)
```
⚠️ WARNING: Database Storage Growing

📊 Current Size: 6.50 GB / 8 GB (81.3%)

💡 Monitoring: Consider planning upgrade or cleanup before reaching limit

📋 Top 5 Largest Tables:
1. public.Order: 2.5 GB
2. public.Batch: 1.8 GB
...

💡 Recommendations:
• Review and archive old data
• Clean up unused records
• Monitor growth trends
```

### Critical Alert (90%)
```
🚨 CRITICAL: Database Storage Limit Approaching!

📊 Current Size: 7.30 GB / 8 GB (91.3%)

⚠️ Action Required: Upgrade plan or perform data cleanup immediately!

📋 Top 5 Largest Tables:
1. public.Order: 3.2 GB
2. public.Batch: 2.1 GB
...

💡 Recommendations:
• Archive old orders/transactions
• Clean up soft-deleted records
• Remove expired sessions
• Consider upgrading Supabase plan
```

## API Endpoints

### Manual Health Check
```bash
POST /monitoring/health-check
```
Triggers full health check including database size monitoring.

### Database Size Check
```bash
GET /monitoring/database-size
```
Manually trigger database size check and get status.

## Supabase Plan Limits

### Pro Plan ($25/month)
- **Database Storage**: 8 GB
- **Connection Pool**: 200 connections
- **API Requests**: Unlimited (with rate limits)
- **Bandwidth**: 250 GB/month

### Team Plan ($599/month)
- **Database Storage**: 100 GB
- **Connection Pool**: 400 connections
- **API Requests**: Unlimited
- **Bandwidth**: 1 TB/month

## Recommendations

### When Warning Alert (80%)
1. Review data growth trends
2. Plan data archiving strategy
3. Identify cleanup targets (top tables)
4. Consider upgrade timeline

### When Critical Alert (90%)
1. **Immediate Actions**:
   - Archive old orders/transactions (>6 months)
   - Clean up soft-deleted records
   - Remove expired sessions
   - Delete old logs/audit trails

2. **Upgrade Options**:
   - Upgrade to Team plan ($599/month) for 100GB
   - Or optimize data usage first

### Data Cleanup Strategies

1. **Archive Old Data**:
   ```sql
   -- Example: Archive orders older than 1 year
   CREATE TABLE OrderArchive AS 
   SELECT * FROM "Order" 
   WHERE created_at < NOW() - INTERVAL '1 year';
   
   DELETE FROM "Order" 
   WHERE created_at < NOW() - INTERVAL '1 year';
   ```

2. **Clean Soft Deletes**:
   ```sql
   -- Remove soft-deleted records older than 90 days
   DELETE FROM "Product" 
   WHERE is_active = false 
   AND updated_at < NOW() - INTERVAL '90 days';
   ```

3. **Remove Expired Sessions**:
   ```sql
   -- Clean up expired sessions
   DELETE FROM "Session" 
   WHERE expires_at < NOW();
   ```

## Monitoring Frequency

- **Automatic**: Runs during health checks (if enabled in `onModuleInit`)
- **Manual**: Can be triggered via API endpoints
- **Recommended**: Check every 1 hour in production

## Troubleshooting

### Not Receiving Alerts?

1. Check environment variables:
   ```bash
   echo $NODE_ENV                    # Should be "production"
   echo $ENABLE_TELEGRAM_NOTIFICATIONS  # Should be "true"
   echo $TELEGRAM_BOT_TOKEN         # Should be set
   echo $TELEGRAM_CHAT_ID           # Should be set
   ```

2. Test Telegram notification:
   ```bash
   curl -X POST http://localhost:3001/monitoring/test-notification
   ```

3. Check logs:
   ```bash
   # Look for monitoring service logs
   grep "Database storage" logs/app.log
   ```

### False Positives?

- Adjust thresholds in `.env`:
  ```bash
  DB_SIZE_WARNING_THRESHOLD=0.75    # 75% instead of 80%
  DB_SIZE_CRITICAL_THRESHOLD=0.85   # 85% instead of 90%
  ```

## Notes

- Alerts are only sent in **production** environment
- Requires `ENABLE_TELEGRAM_NOTIFICATIONS=true`
- Cooldown prevents spam (1 hour between same alert type)
- Messages are in **English** for consistency

