import { NextRequest, NextResponse } from 'next/server';
import { signRequest } from '@worldcoin/idkit-core/signing';

const RAW_KEY = process.env.RP_SIGNING_KEY ?? process.env.WORLD_ID_SIGNING_KEY ?? '';
// Normalizar: siempre con prefijo 0x (funciona si el usuario lo puso con o sin 0x)
const RP_SIGNING_KEY = RAW_KEY.startsWith('0x') ? RAW_KEY : `0x${RAW_KEY}`;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action } = body;

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  if (!RP_SIGNING_KEY) {
    return NextResponse.json(
      { error: 'RP_SIGNING_KEY not configured on server' },
      { status: 500 }
    );
  }

  try {
    const { sig, nonce, createdAt, expiresAt } = signRequest({
      signingKeyHex: RP_SIGNING_KEY,
      action,
    });

    return NextResponse.json({
      sig,
      nonce,
      created_at: createdAt,
      expires_at: expiresAt,
    });
  } catch (err: any) {
    console.error('[rp-signature] Failed to sign:', err);
    return NextResponse.json(
      { error: 'Failed to generate RP signature', detail: err.message },
      { status: 500 }
    );
  }
}
