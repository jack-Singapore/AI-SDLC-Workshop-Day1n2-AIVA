import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRegistrationResponse,
  VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB, tagDB } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/auth';

const RP_ID = process.env.RP_ID || 'localhost';

/**
 * POST /api/auth/register-verify
 * Verify WebAuthn registration response and create user
 */
export async function POST(request: NextRequest) {
  try {
    const { username, challenge, credential } = await request.json();

    if (!username || !challenge || !credential) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get origin from request to support dynamic ports
    const origin = request.headers.get('origin') || process.env.ORIGIN || 'http://localhost:3000';

    // Verify the credential
    const opts: VerifyRegistrationResponseOpts = {
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: RP_ID,
    };

    const verification = await verifyRegistrationResponse(opts);

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Registration verification failed' }, { status: 400 });
    }

    const { credential: credentialData } = verification.registrationInfo;

    // Create user
    const user = userDB.create(username.trim());

    // Create default tags for the user
    const defaultTags = [
      { name: 'Work', color: '#3B82F6' },
      { name: 'Workout', color: '#EF4444' },
      { name: 'Learning', color: '#8B5CF6' },
      { name: 'Reading', color: '#10B981' },
    ];

    defaultTags.forEach((tag) => {
      tagDB.create({
        user_id: user.id,
        name: tag.name,
        color: tag.color,
      });
    });

    // Store authenticator
    authenticatorDB.create({
      user_id: user.id,
      credential_id: typeof credentialData.id === 'string' ? credentialData.id : isoBase64URL.fromBuffer(credentialData.id as Uint8Array),
      public_key: isoBase64URL.fromBuffer(credentialData.publicKey),
      counter: credentialData.counter ?? 0,
    });

    // Create session
    const token = await createSession(user.id, user.username);
    await setSessionCookie(token);

    return NextResponse.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('Error verifying registration:', error);
    return NextResponse.json({ error: 'Registration verification failed' }, { status: 500 });
  }
}
