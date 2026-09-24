-- PR: phone/email identity — phone becomes optional when email is used
ALTER TABLE users
  MODIFY COLUMN phone VARCHAR(32) NULL;
