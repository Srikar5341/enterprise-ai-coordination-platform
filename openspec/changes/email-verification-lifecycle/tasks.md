# Tasks: Secure Email Verification Lifecycle

## Implementation Checklist

- [x] 1. Define `RateLimitError` (HTTP 429) in `src/core/errors.py` <!-- id: 1-rate-limit-error -->
- [x] 2. Create pluggable email delivery interface and development sink in `src/domains/auth/email_delivery.py` <!-- id: 2-email-delivery-interface -->
- [x] 3. Update User SQLAlchemy model with hashed verification token, expiry, consumption, and resend tracking in `src/domains/auth/models.py` <!-- id: 3-user-model-update -->
- [x] 4. Generate and run non-destructive Alembic migration adding verification columns to `users` table <!-- id: 4-alembic-migration -->
- [x] 5. Implement verification and resend schemas in `src/domains/auth/schemas.py` <!-- id: 5-auth-schemas -->
- [x] 6. Update `AuthService` in `src/domains/auth/service.py` with token hashing, expiry validation, single-use enforcement, resend rate limiting, and unverified login gating <!-- id: 6-auth-service-logic -->
- [x] 7. Implement `POST /api/v1/auth/verify-email` and `POST /api/v1/auth/resend-verification` in `src/api/routes/auth.py` <!-- id: 7-auth-endpoints -->
- [x] 8. Write comprehensive automated test suite covering registration, valid verification, expiry, replay, resend limits, unverified login rejection, and verified login success in `backend/tests/test_email_verification.py` <!-- id: 8-test-suite -->
- [x] 9. Update live workflow verification script to validate complete verification lifecycle and scoped counts <!-- id: 9-live-verification-script -->
- [x] 10. Regenerate `docs/openapi.json`, update `docs/PROJECT_STATUS.md` and `docs/DECISIONS_REQUIRED.md`, and validate OpenSpec <!-- id: 10-docs-and-validation -->
