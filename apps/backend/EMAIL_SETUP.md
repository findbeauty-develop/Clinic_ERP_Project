# 📧 EMAIL PROVIDER - Quick Start

## Mailgun Setup (Recommended)

Add to your `.env` file:

```bash
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=your_mailgun_api_key_here
MAILGUN_DOMAIN=sandboxXXXXXXXX.mailgun.org
MAILGUN_FROM_EMAIL=Clinic ERP <noreply@sandboxXXXXXXXX.mailgun.org>
```

## AWS SES Setup (Alternative)

Add to your `.env` file:

```bash
EMAIL_PROVIDER=amazon-ses
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_SES_FROM_EMAIL=noreply@example.com
```

---

**📖 Full Setup Guide**: See [MAILGUN_SETUP.md](./MAILGUN_SETUP.md) for detailed instructions.
