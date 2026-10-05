-- Contact us: add "payment" and "weight_mismatch" topics (order-related rules live in routes/support.ts)
ALTER TABLE support_tickets
  MODIFY COLUMN topic ENUM(
    'order_pickup',
    'item_mismatch',
    'weight_mismatch',
    'payment',
    'account_login',
    'donation',
    'other'
  ) NOT NULL;
