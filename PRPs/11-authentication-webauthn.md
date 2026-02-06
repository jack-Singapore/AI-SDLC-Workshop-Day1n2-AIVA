# Feature 11: WebAuthn/Passkeys Authentication

## Feature Overview

Implement passwordless authentication using WebAuthn (Web Authentication API) with passkeys for biometric authentication (fingerprint, face ID, security keys). Users register and login without passwords using the `@simplewebauthn` library. Sessions are managed with JWT tokens stored in HTTP-only cookies with 7-day expiry. Middleware protects routes requiring authentication.

## User Stories

**As a user**, I want to:
- Register an account using only a username and my biometric device (no password needed)
- Login using my fingerprint/face ID/security key
- Have my session persist for 7 days without re-authenticating
- Be automatically redirected to login if I try to access protected routes
- Logout and have my session immediately cleared
- See which routes require authentication
- Use passkeys across multiple devices (if supported)
- Have the system work on all modern browsers that support WebAuthn

## User Flow

### Registration Flow
1. User visits `/login` page
2. User enters username (e.g., "john_doe")
3. User clicks "Register" button
4. System generates WebAuthn registration challenge
5. Browser prompts for biometric authentication:
   - "Use Touch ID to create passkey for todo-app"
   - Or "Use Windows Hello"
   - Or "Insert security key"
6. User authenticates with biometric/security key
7. System verifies registration and creates user account
8. System creates session (JWT in HTTP-only cookie)
9. User redirected to `/` (main todo page)

### Login Flow
1. User visits `/login` page
2. User enters username
3. User clicks "Login" button
4. System generates WebAuthn authentication challenge
5. Browser prompts for biometric:
   - "Use Touch ID to sign in to todo-app"
6. User authenticates
7. System verifies authentication response
8. System creates session (JWT in HTTP-only cookie)
9. User redirected to `/` (main todo page)

### Session Management
1. User successfully logs in
2. JWT token stored in HTTP-only cookie with:
   - Name: `session`
   - HttpOnly: true
   - Secure: true (production only)
   - SameSite: 'lax'
   - Max-Age: 7 days (604800 seconds)
3. Every API request includes cookie automatically
4. Middleware checks session validity on protected routes
5. After 7 days, session expires, user must login again

### Logout Flow
1. User clicks "Logout" button
2. POST request sent to `/api/auth/logout`
3. Server deletes session cookie
4. User redirected to `/login`
5. Any subsequent protected route access requires login

### Protected Route Access (Unauthenticated)
1. User visits `/` or `/calendar` without session
2. Middleware checks for valid session cookie
3. No valid session found
4. User redirected to `/login?redirect=/`
5. After successful login, user redirected back to original page

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS authenticators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,  -- Base64URL encoded
  credential_public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  credential_device_type TEXT,
  credential_backed_up BOOLEAN,
  transports TEXT,  -- JSON array of transports
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);
CREATE INDEX IF NOT EXISTS idx_authenticators_credential_id ON authenticators(credential_id);
```

### TypeScript Types

```typescript
// lib/db.ts
export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;  // Base64URL
  credential_public_key: Buffer;
  counter: number;
  credential_device_type: string | null;
  credential_backed_up: boolean | null;
  transports: string | null;  // JSON string
  created_at: string;
}

// lib/auth.ts
export interface SessionPayload {
  userId: number;
  username: string;
  iat: number;  // Issued at
  exp: number;  // Expiration
}
```

### Environment Variables

```env
# .env.local
JWT_SECRET=your-super-secret-key-min-32-characters-long
RP_ID=localhost  # or your-domain.com in production
RP_NAME=Todo App
RP_ORIGIN=http://localhost:3000  # or https://your-domain.com
```

### Session Management

```typescript
// lib/auth.ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-for-development-only'
);

const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

export async function createSession(userId: number, username: string): Promise<string> {
  const token = await new SignJWT({ userId, username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
  
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get('session')?.value;
  
  if (!token) return null;
  
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as SessionPayload;
  } catch (error) {
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  (await cookies()).delete('session');
}
```

### Middleware

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-for-development-only'
);

const PROTECTED_ROUTES = ['/', '/calendar'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if route is protected
  if (!PROTECTED_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }
  
  // Get session cookie
  const token = request.cookies.get('session')?.value;
  
  if (!token) {
    // Redirect to login with return URL
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }
  
  try {
    // Verify JWT
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch (error) {
    // Invalid token, redirect to login
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ['/', '/calendar'],
};
```

### API Endpoints

#### POST /api/auth/register-options - Generate Registration Challenge

```typescript
// app/api/auth/register-options/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { userDB } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { username } = await request.json();
  
  // Check if username already exists
  const existingUser = userDB.findByUsername(username);
  if (existingUser) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 400 });
  }
  
  const options = await generateRegistrationOptions({
    rpName: process.env.RP_NAME || 'Todo App',
    rpID: process.env.RP_ID || 'localhost',
    userName: username,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  
  // Store challenge temporarily (in production, use session storage or Redis)
  // For simplicity, storing in cookie
  const response = NextResponse.json(options);
  response.cookies.set('challenge', options.challenge, {
    httpOnly: true,
    maxAge: 300, // 5 minutes
  });
  response.cookies.set('username', username, {
    httpOnly: true,
    maxAge: 300,
  });
  
  return response;
}
```

#### POST /api/auth/register-verify - Verify Registration

```typescript
// app/api/auth/register-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const challenge = request.cookies.get('challenge')?.value;
  const username = request.cookies.get('username')?.value;
  
  if (!challenge || !username) {
    return NextResponse.json({ error: 'Missing challenge or username' }, { status: 400 });
  }
  
  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: process.env.RP_ORIGIN || 'http://localhost:3000',
      expectedRPID: process.env.RP_ID || 'localhost',
    });
    
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }
    
    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    
    // Create user
    const user = userDB.create({ username });
    
    // Store authenticator
    authenticatorDB.create({
      user_id: user.id,
      credential_id: isoBase64URL.fromBuffer(credentialID),
      credential_public_key: Buffer.from(credentialPublicKey),
      counter: counter ?? 0,  // Handle undefined counter
      credential_device_type: null,
      credential_backed_up: null,
      transports: null,
    });
    
    // Create session
    const token = await createSession(user.id, user.username);
    
    const response = NextResponse.json({ verified: true, userId: user.id });
    await setSessionCookie(token);
    
    // Clear temporary cookies
    response.cookies.delete('challenge');
    response.cookies.delete('username');
    
    return response;
    
  } catch (error) {
    console.error('Registration verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }
}
```

#### POST /api/auth/login-options - Generate Login Challenge

```typescript
// app/api/auth/login-options/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { username } = await request.json();
  
  const user = userDB.findByUsername(username);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  
  const authenticators = authenticatorDB.findByUserId(user.id);
  
  const options = await generateAuthenticationOptions({
    rpID: process.env.RP_ID || 'localhost',
    allowCredentials: authenticators.map(auth => ({
      id: isoBase64URL.toBuffer(auth.credential_id),
      type: 'public-key',
      transports: auth.transports ? JSON.parse(auth.transports) : undefined,
    })),
    userVerification: 'preferred',
  });
  
  const response = NextResponse.json(options);
  response.cookies.set('challenge', options.challenge, {
    httpOnly: true,
    maxAge: 300,
  });
  response.cookies.set('userId', user.id.toString(), {
    httpOnly: true,
    maxAge: 300,
  });
  
  return response;
}
```

#### POST /api/auth/login-verify - Verify Login

```typescript
// app/api/auth/login-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const challenge = request.cookies.get('challenge')?.value;
  const userIdStr = request.cookies.get('userId')?.value;
  
  if (!challenge || !userIdStr) {
    return NextResponse.json({ error: 'Missing challenge or userId' }, { status: 400 });
  }
  
  const userId = parseInt(userIdStr);
  const user = userDB.findById(userId);
  
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  
  // Find authenticator by credential ID
  const credentialId = isoBase64URL.fromBuffer(body.rawId);
  const authenticator = authenticatorDB.findByCredentialId(credentialId);
  
  if (!authenticator || authenticator.user_id !== userId) {
    return NextResponse.json({ error: 'Authenticator not found' }, { status: 404 });
  }
  
  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: process.env.RP_ORIGIN || 'http://localhost:3000',
      expectedRPID: process.env.RP_ID || 'localhost',
      authenticator: {
        credentialID: isoBase64URL.toBuffer(authenticator.credential_id),
        credentialPublicKey: new Uint8Array(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0,  // Handle undefined counter
      },
    });
    
    if (!verification.verified) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }
    
    // Update counter
    authenticatorDB.updateCounter(authenticator.id, verification.authenticationInfo.newCounter ?? 0);
    
    // Create session
    const token = await createSession(user.id, user.username);
    
    const response = NextResponse.json({ verified: true, userId: user.id });
    await setSessionCookie(token);
    
    // Clear temporary cookies
    response.cookies.delete('challenge');
    response.cookies.delete('userId');
    
    return response;
    
  } catch (error) {
    console.error('Login verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }
}
```

#### POST /api/auth/logout - Logout

```typescript
// app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  await deleteSession();
  return NextResponse.json({ message: 'Logged out successfully' });
}
```

#### GET /api/auth/me - Get Current User

```typescript
// app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  return NextResponse.json({ 
    userId: session.userId, 
    username: session.username 
  });
}
```

## UI Components

### Login Page Component

```typescript
// app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const redirect = searchParams.get('redirect') || '/';
  
  const handleRegister = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Get registration options
      const optionsRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      
      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Registration failed');
      }
      
      const options = await optionsRes.json();
      
      // Start WebAuthn registration
      const attResp = await startRegistration(options);
      
      // Verify registration
      const verifyRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attResp),
      });
      
      if (!verifyRes.ok) {
        throw new Error('Verification failed');
      }
      
      // Redirect to app
      router.push(redirect);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };
  
  const handleLogin = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Get login options
      const optionsRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      
      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Login failed');
      }
      
      const options = await optionsRes.json();
      
      // Start WebAuthn authentication
      const authResp = await startAuthentication(options);
      
      // Verify authentication
      const verifyRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authResp),
      });
      
      if (!verifyRes.ok) {
        throw new Error('Verification failed');
      }
      
      // Redirect to app
      router.push(redirect);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Todo App Login</h1>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your username"
              data-testid="username-input"
              disabled={loading}
            />
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleRegister}
              disabled={loading || !username}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              data-testid="register-button"
            >
              {loading ? 'Processing...' : 'Register'}
            </button>
            
            <button
              onClick={handleLogin}
              disabled={loading || !username}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              data-testid="login-button"
            >
              {loading ? 'Processing...' : 'Login'}
            </button>
          </div>
        </div>
        
        <p className="mt-6 text-sm text-gray-600 text-center">
          This app uses WebAuthn for passwordless authentication. You'll use your fingerprint, face ID, or security key to sign in.
        </p>
      </div>
    </div>
  );
}
```

### Logout Button Component

```typescript
// components/LogoutButton.tsx
'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };
  
  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded"
      data-testid="logout-button"
    >
      Logout
    </button>
  );
}
```

## Edge Cases

### 1. Browser Doesn't Support WebAuthn
- **Scenario**: User opens app in old browser
- **Handling**: Check `window.PublicKeyCredential` availability
- **Message**: "Your browser doesn't support WebAuthn. Please use a modern browser."

### 2. User Cancels WebAuthn Prompt
- **Scenario**: User clicks "Cancel" on fingerprint prompt
- **Handling**: Catch error from `startRegistration()`/`startAuthentication()`
- **Error**: "Authentication cancelled. Please try again."

### 3. Multiple Authenticators for Same User
- **Scenario**: User registers from phone, then laptop
- **Handling**: Allow multiple authenticators per user
- **Result**: User can login from either device

### 4. Session Expires Mid-Use
- **Scenario**: User's 7-day session expires while using app
- **Handling**: Next API call returns 401, middleware redirects to login
- **UX**: Show message "Session expired. Please login again."

### 5. Invalid JWT Token
- **Scenario**: User manually edits session cookie
- **Handling**: `jwtVerify()` throws error, caught in middleware
- **Result**: Redirect to login

### 6. Username Already Taken
- **Scenario**: User tries to register with existing username
- **Handling**: Check `userDB.findByUsername()` before creating
- **Error**: "Username already taken"

### 7. Credential ID Not Found on Login
- **Scenario**: User tries to login but authenticator was deleted
- **Handling**: Return 404 error
- **Error**: "Authenticator not found. Please register again."

### 8. Counter Undefined from WebAuthn
- **Scenario**: Some authenticators don't return counter
- **Handling**: Use `counter ?? 0` (null coalescing)
- **Result**: Default to 0, prevents TypeError

## Acceptance Criteria

### Must Have
- ✅ Register new user with username and WebAuthn
- ✅ Login existing user with WebAuthn
- ✅ Session stored in HTTP-only cookie
- ✅ Session expires after 7 days
- ✅ Logout clears session immediately
- ✅ Middleware protects / and /calendar routes
- ✅ Unauthenticated users redirected to /login
- ✅ Redirect back to original page after login
- ✅ All API routes check session with `getSession()`
- ✅ JWT secret from environment variable
- ✅ RP_ID and RP_ORIGIN configurable
- ✅ Handle undefined counter with ?? 0
- ✅ Support multiple authenticators per user
- ✅ Clear error messages for all failure cases

### Should Have
- ⚠️ Remember username (localStorage)
- ⚠️ Display user info in header
- ⚠️ "Stay logged in" checkbox (extend session)
- ⚠️ List registered authenticators in settings

### Nice to Have
- ❌ 2FA/MFA with additional factors
- ❌ Email verification
- ❌ Password recovery (N/A for passwordless)
- ❌ Social login (Google, GitHub)
- ❌ Account deletion
- ❌ Username change

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/11-authentication.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ context }) => {
    // Add virtual authenticator for WebAuthn
    await context.addVirtualAuthenticator({
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      isUserVerified: true,
    });
  });
  
  test('should register new user', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('[data-testid="username-input"]', 'testuser');
    await page.click('[data-testid="register-button"]');
    
    // Wait for redirect
    await page.waitForURL('/');
    
    // Should be on main page
    expect(page.url()).toContain('/');
  });
  
  test('should login existing user', async ({ page }) => {
    // First register
    await page.goto('/login');
    await page.fill('[data-testid="username-input"]', 'logintest');
    await page.click('[data-testid="register-button"]');
    await page.waitForURL('/');
    
    // Logout
    await page.click('[data-testid="logout-button"]');
    await page.waitForURL('/login');
    
    // Login again
    await page.fill('[data-testid="username-input"]', 'logintest');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/');
    
    expect(page.url()).toContain('/');
  });
  
  test('should protect routes', async ({ page }) => {
    await page.goto('/');
    
    // Should redirect to login
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('/login');
  });
  
  test('should redirect back after login', async ({ page }) => {
    await page.goto('/calendar');
    
    // Redirected to login with redirect param
    await page.waitForURL(/\/login\?redirect=/);
    expect(page.url()).toContain('redirect=%2Fcalendar');
    
    // Register and login
    await page.fill('[data-testid="username-input"]', 'redirecttest');
    await page.click('[data-testid="register-button"]');
    
    // Should redirect to calendar
    await page.waitForURL('/calendar');
    expect(page.url()).toContain('/calendar');
  });
  
  test('should logout successfully', async ({ page }) => {
    // Register
    await page.goto('/login');
    await page.fill('[data-testid="username-input"]', 'logouttest');
    await page.click('[data-testid="register-button"]');
    await page.waitForURL('/');
    
    // Logout
    await page.click('[data-testid="logout-button"]');
    
    // Should redirect to login
    await page.waitForURL('/login');
    
    // Accessing protected route should still redirect
    await page.goto('/');
    await page.waitForURL(/\/login/);
  });
});
```

### Unit Tests

```typescript
// tests/auth.test.ts
import { createSession, getSession } from '@/lib/auth';

describe('Session Management', () => {
  it('should create valid JWT token', async () => {
    const token = await createSession(1, 'testuser');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });
  
  it('should decode session from token', async () => {
    const token = await createSession(1, 'testuser');
    // Would need to mock cookies for this test
    // const session = await getSession();
    // expect(session?.userId).toBe(1);
    // expect(session?.username).toBe('testuser');
  });
});
```

## Out of Scope

- Traditional password authentication
- Email/phone verification
- Password reset
- Social OAuth (Google, Facebook, GitHub)
- Multi-factor authentication (beyond WebAuthn)
- Account recovery
- User profile management
- Role-based access control (RBAC)
- API key authentication

## Success Metrics

### Functional Metrics
- ✅ 100% of registration attempts succeed (with valid username)
- ✅ 100% of login attempts succeed (with registered user)
- ✅ Session persists for full 7 days
- ✅ Logout immediately clears session

### Technical Metrics
- ✅ Registration completes in < 3s
- ✅ Login completes in < 2s
- ✅ JWT verification adds < 10ms to API requests
- ✅ All protected routes secured by middleware

### User Experience Metrics
- ✅ WebAuthn prompt clear and understandable
- ✅ Error messages actionable
- ✅ Redirect flow seamless
- ✅ No password management burden

## Implementation Checklist

- [ ] Database schema (users, authenticators tables)
- [ ] Environment variables (.env.local)
- [ ] Session management (lib/auth.ts)
- [ ] Middleware for route protection
- [ ] POST /api/auth/register-options
- [ ] POST /api/auth/register-verify
- [ ] POST /api/auth/login-options
- [ ] POST /api/auth/login-verify
- [ ] POST /api/auth/logout
- [ ] GET /api/auth/me
- [ ] Login page (/app/login/page.tsx)
- [ ] LogoutButton component
- [ ] Update all API routes to use getSession()
- [ ] Handle counter ?? 0 in verification
- [ ] E2E tests with virtual authenticator
- [ ] Error handling for all auth flows
- [ ] Redirect flow with URL params

---

**Last Updated**: February 6, 2026
**Feature Status**: Phase 5 - Infrastructure (can be developed last)
**Dependencies**: None (but other features depend on this for production)
