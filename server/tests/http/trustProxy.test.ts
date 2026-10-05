import express from 'express';
import request from 'supertest';
import { resolveTrustProxy } from '../../src/app';

describe('resolveTrustProxy', () => {
  it('defaults to 1 hop in production and off elsewhere', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production' })).toBe(1);
    expect(resolveTrustProxy({ NODE_ENV: 'test' })).toBe(false);
  });

  it('honours TRUST_PROXY overrides', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: '2' })).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: 'false', NODE_ENV: 'production' })).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: 'loopback' })).toBe('loopback');
  });

  it('makes req.ip the client address from X-Forwarded-For when trusted', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const res = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.7');
    expect(res.body.ip).toBe('203.0.113.7');
  });
});
