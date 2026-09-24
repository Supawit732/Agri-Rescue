-- Profile photo (public URL path under /uploads/avatars/)
ALTER TABLE users
  ADD COLUMN avatar VARCHAR(1024) NULL AFTER district_en;
