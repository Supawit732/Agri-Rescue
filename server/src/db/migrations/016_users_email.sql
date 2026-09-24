-- PR A: optional unique email for phone-or-email login and profile contact
ALTER TABLE users
  ADD COLUMN email VARCHAR(255) NULL AFTER phone,
  ADD UNIQUE KEY idx_users_email (email);
