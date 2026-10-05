import type { NextFunction, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';

/**
 * Admin activity log. Mounted once, globally, so no admin mutation can skip it:
 * every successful POST/PUT/PATCH/DELETE made by an admin writes an admin_audit_log row.
 * Routes with a registry entry below get a precise action/target/summary; any other
 * admin mutation still gets a generic `other.<method>` row.
 */

export interface AuditEntry {
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}

interface AuditContext {
  params: Record<string, string>;
  body: Record<string, unknown>;
  response: Record<string, unknown>;
}

type Describe = (ctx: AuditContext) => AuditEntry | Promise<AuditEntry>;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Routes whose mutations are not admin decisions (own inbox state). */
const IGNORED_PREFIXES = ['/api/notifications'];

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

async function orgName(userId: string): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(bp.org_name, u.name) AS label
     FROM users u LEFT JOIN buyer_profiles bp ON bp.user_id = u.id WHERE u.id = ?`,
    [userId],
  );
  return rows[0] === undefined ? null : String(rows[0].label);
}

function orgReview(action: string, verb: string, withReason: boolean): Describe {
  return async ({ params, body }) => {
    const label = await orgName(String(params.userId));
    const metadata: Record<string, unknown> = { target_label: label };
    if (withReason) {
      metadata.reason = str(body.reason) ?? null;
      if (Array.isArray(body.requested_fields)) metadata.requested_fields = body.requested_fields;
    }
    return {
      action,
      targetType: 'org',
      targetId: String(params.userId),
      summary: `${verb} organization application ${label ?? `#${params.userId}`}`,
      metadata,
    };
  };
}

const simple =
  (action: string, targetType: string, idParam: string, summary: string): Describe =>
  ({ params }) => ({
    action,
    targetType,
    targetId: String(params[idParam]),
    summary: `${summary} #${params[idParam]}`,
  });

const REGISTRY: Record<string, Describe> = {
  'POST /api/donors/admin/org-applications/:userId/approve': orgReview('org.approve', 'Approved', false),
  'POST /api/donors/admin/org-applications/:userId/reject': orgReview('org.reject', 'Rejected', true),
  'POST /api/donors/admin/org-applications/:userId/needs-more-info': orgReview(
    'org.request_info',
    'Requested more info for',
    true,
  ),
  'POST /api/donors/admin/org-applications/:userId/checklist': orgReview('org.checklist', 'Saved checklist for', false),
  'POST /api/donors/admin/donors/:userId/unlock': simple('user.unlock_donor', 'user', 'userId', 'Unlocked donor'),

  'POST /api/support/tickets/:id/messages': ({ params, body, response }) => {
    const message = (response.message ?? {}) as { id?: number };
    return {
      action: 'support.reply',
      targetType: 'support_ticket',
      targetId: String(params.id),
      summary: `Replied to support ticket #${params.id}`,
      metadata: {
        message_id: message.id ?? null,
        body_length: typeof body.body === 'string' ? body.body.length : 0,
        attachments: Array.isArray(body.attachments) ? body.attachments.length : 0,
      },
    };
  },
  'PATCH /api/support/tickets/:id': ({ params, body }) => {
    const status = str(body.status);
    const action =
      status === 'closed' ? 'support.close' : status !== undefined ? 'support.status' : 'support.flag';
    return {
      action,
      targetType: 'support_ticket',
      targetId: String(params.id),
      summary:
        status !== undefined
          ? `Set support ticket #${params.id} to ${status}`
          : `Updated support ticket #${params.id}`,
      metadata: { status: status ?? null, has_new_reply: body.has_new_reply ?? null },
    };
  },

  'POST /api/admin/lots/:id/hide': ({ params, body }) => ({
    action: 'lot.hide',
    targetType: 'lot',
    targetId: String(params.id),
    summary: `Hid lot #${params.id}`,
    metadata: { reason: str(body.reason) ?? null },
  }),
  'POST /api/admin/lots/:id/unhide': simple('lot.unhide', 'lot', 'id', 'Unhid lot'),
  'POST /api/admin/orders/:id/unlock-otp': simple('order.unlock_otp', 'order', 'id', 'Unlocked OTP on order'),
  'POST /api/admin/crops/:id/merge': ({ params, body }) => ({
    action: 'crop.merge',
    targetType: 'crop',
    targetId: String(params.id),
    summary: `Merged crop #${params.id} into #${String(body.target_id)}`,
    metadata: { target_id: body.target_id ?? null },
  }),

  'POST /api/admin/dit/products/refresh': () => ({
    action: 'dit.refresh_catalog',
    targetType: null,
    targetId: null,
    summary: 'Refreshed MOC product catalog',
  }),
  'POST /api/admin/dit/sync': () => ({
    action: 'dit.sync',
    targetType: null,
    targetId: null,
    summary: 'Started DIT price sync',
  }),
  'POST /api/admin/dit/crops/:id/mapping': ({ params, body }) => ({
    action: 'dit.mapping',
    targetType: 'crop',
    targetId: String(params.id),
    summary: `Mapped crop #${params.id} to ${String(body.product_code)}`,
    metadata: { product_code: body.product_code ?? null, unit_to_kg: body.unit_to_kg ?? null },
  }),
  'POST /api/admin/dit/crops/:id/unit-factor': ({ params, body }) => ({
    action: 'dit.unit_factor',
    targetType: 'crop',
    targetId: String(params.id),
    summary: `Set unit factor of crop #${params.id}`,
    metadata: { unit_to_kg: body.unit_to_kg ?? null },
  }),
  'POST /api/admin/dit/crops/:id/suggest': simple('dit.suggest', 'crop', 'id', 'Requested DIT suggestions for crop'),
  'POST /api/admin/dit/suggestions/:id/accept': simple(
    'dit.suggestion_accept',
    'dit_suggestion',
    'id',
    'Accepted DIT suggestion',
  ),
  'POST /api/admin/dit/suggestions/:id/reject': simple(
    'dit.suggestion_reject',
    'dit_suggestion',
    'id',
    'Rejected DIT suggestion',
  ),
};

function describeFallback(req: Request): AuditEntry {
  const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
  return {
    action: `other.${req.method.toLowerCase()}`,
    targetType: null,
    targetId: null,
    summary: `${req.method} ${path}`,
    metadata: { path },
  };
}

async function describe(req: Request, response: unknown): Promise<AuditEntry> {
  const route = typeof req.route?.path === 'string' ? req.route.path : '';
  const known = REGISTRY[`${req.method} ${req.baseUrl}${route}`];
  if (known === undefined) return describeFallback(req);
  try {
    return await known({
      params: req.params as Record<string, string>,
      body: (req.body ?? {}) as Record<string, unknown>,
      response: (response ?? {}) as Record<string, unknown>,
    });
  } catch {
    return describeFallback(req);
  }
}

/** The single write path. Never throws: the admin's action already succeeded. */
export async function recordAdminAction(adminId: number, entry: AuditEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, summary, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        adminId,
        entry.action.slice(0, 64),
        entry.targetType,
        entry.targetId,
        entry.summary.slice(0, 512),
        entry.metadata === undefined ? null : JSON.stringify(entry.metadata),
      ],
    );
  } catch (error) {
    console.error('admin audit log write failed', error);
  }
}

function shouldAudit(req: Request, res: Response): boolean {
  return (
    req.auth?.is_admin === true &&
    res.statusCode < 400 &&
    !SAFE_METHODS.has(req.method) &&
    !IGNORED_PREFIXES.some((prefix) => req.originalUrl.startsWith(prefix))
  );
}

export function adminAudit(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  let recorded = false;
  const record = async (body: unknown): Promise<void> => {
    recorded = true;
    await recordAdminAction(req.auth?.id ?? 0, await describe(req, body));
  };

  // Write the row before the response goes out so a client that saw success can rely on the log.
  const json = res.json.bind(res);
  res.json = (body?: unknown): Response => {
    if (recorded || !shouldAudit(req, res)) return json(body);
    void record(body).finally(() => json(body));
    return res;
  };
  // Handlers that answer without res.json still get logged.
  res.on('finish', () => {
    if (!recorded && shouldAudit(req, res)) void record(undefined);
  });
  next();
}
