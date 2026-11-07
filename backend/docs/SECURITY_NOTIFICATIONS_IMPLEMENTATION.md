# Security and Notifications Implementation

## Required deployment step

Run the database migration before starting the updated backend:

```bash
npm run migrate
```

Migration `040_user_security_policies.sql` adds login-attempt tracking, temporary account locks, password-change timestamps, and last-login timestamps.

## Security settings now enforced

- **Session Timeout (minutes):** the frontend locks an inactive session using the current store setting and receives live setting updates.
- **Max Login Attempts:** failed attempts are counted per account. Reaching the configured limit locks login for 15 minutes.
- **Password Expiry (days):** expired passwords force the user to change the password before accessing protected application pages. Set the value to `0` to disable expiry.

## Notification delivery

In-App, Email, and SMS delivery now checks the current store's notification preferences before sending. Supported events include sales, purchase receiving, stock transfers, sales returns, stock adjustments, new users, security activity, cloud backup, low stock, payment due, and daily summaries.

Email delivery requires the existing SMTP configuration. SMS delivery requires an active SMS integration for the store.

## Scheduled notification environment variables

```env
BUSINESS_TIMEZONE=Africa/Dar_es_Salaam
NOTIFICATION_SCHEDULER_HOUR=8
NOTIFICATION_SCHEDULER_ENABLED=true
```

The scheduler checks hourly and sends each scheduled alert at most once per store per business day.
