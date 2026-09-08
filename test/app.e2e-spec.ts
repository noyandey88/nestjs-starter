import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createApp } from '../src/bootstrap.js';

describe('API flow (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'S3cure-password!';
  let accessToken: string;
  let refreshToken: string;
  let rotatedRefreshToken: string;
  let courseId: number;

  beforeAll(async () => {
    // Same factory as main.ts, so instrumentation, helmet, CORS, and the
    // global pipeline are all under test - not a hand-assembled subset.
    app = (await createApp()) as INestApplication<App>;
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns the enveloped hello response', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.payload).toBe('Hello World!');
  });

  it('GET /health reports database up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(JSON.stringify(res.body)).toContain('"up"');
  });

  it('POST /auth/register creates a user without leaking the password', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ firstName: 'E2e', lastName: 'Tester', email, password })
      .expect(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.payload.email).toBe(email);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.payload.password).toBeUndefined();
  });

  it('POST /auth/register rejects a short password with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'E2e',
        lastName: 'Tester',
        email: `x-${email}`,
        password: 'short',
      })
      .expect(400);
  });

  it('POST /auth/login rejects a wrong password with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'not-the-password' })
      .expect(401);
  });

  it('POST /auth/login rejects an unknown email with the same 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `nobody-${email}`, password })
      .expect(401);
  });

  it('POST /auth/register rejects a duplicate email with 409', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ firstName: 'E2e', lastName: 'Tester', email, password })
      .expect(409);
  });

  it('POST /auth/login returns access and refresh tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    accessToken = res.body.payload.accessToken;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    refreshToken = res.body.payload.refreshToken;
    expect(accessToken).toEqual(expect.any(String));
    expect(refreshToken).toEqual(expect.any(String));
  });

  it('GET /users/me requires auth', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('GET /users/me returns the current user', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.payload.email).toBe(email);
  });

  it('POST /courses/create creates a course', async () => {
    const res = await request(app.getHttpServer())
      .post('/courses/create')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'E2E Course',
        description: 'Created by the e2e suite',
        level: `e2e-level-${Date.now()}`,
      })
      .expect(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    courseId = res.body.payload.id;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.payload.createdBy).toBe(email);
  });

  it('GET /courses/get/:id returns the course', async () => {
    const res = await request(app.getHttpServer())
      .get(`/courses/get/${courseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.payload.name).toBe('E2E Course');
  });

  it('PATCH /courses/update/:id updates the course', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/courses/update/${courseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ description: 'Updated by the e2e suite' })
      .expect(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.payload.description).toBe('Updated by the e2e suite');
  });

  it('DELETE /courses/delete/:id is forbidden for non-admins', async () => {
    await request(app.getHttpServer())
      .delete(`/courses/delete/${courseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('GET /courses/get/:id with a non-numeric id returns 400', async () => {
    await request(app.getHttpServer())
      .get('/courses/get/not-a-number')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('POST /auth/access-token/refresh needs no access token and returns a new pair', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/access-token/refresh')
      .send({ refreshToken })
      .expect(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.payload.accessToken).toEqual(expect.any(String));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.payload.refreshToken).toEqual(expect.any(String));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.payload.refreshToken).not.toBe(refreshToken);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    rotatedRefreshToken = res.body.payload.refreshToken;
  });

  it('reusing the redeemed refresh token fails with 401 and revokes the new one too', async () => {
    await request(app.getHttpServer())
      .post('/auth/access-token/refresh')
      .send({ refreshToken })
      .expect(401);

    // reuse detection revoked the whole family, including the rotated token
    await request(app.getHttpServer())
      .post('/auth/access-token/refresh')
      .send({ refreshToken: rotatedRefreshToken })
      .expect(401);
  });

  it('POST /auth/logout revokes even a freshly issued refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const freshAccessToken: string = login.body.payload.accessToken;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const freshRefreshToken: string = login.body.payload.refreshToken;

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${freshAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/access-token/refresh')
      .send({ refreshToken: freshRefreshToken })
      .expect(401);
  });
});
