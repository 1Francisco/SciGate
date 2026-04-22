import { NextRequest, NextResponse } from 'next/server';

const WORLD_APP_ID =
  process.env.WORLD_APP_ID ?? process.env.NEXT_PUBLIC_WORLD_APP_ID ?? '';
const WORLD_ACTION_ID =
  process.env.WORLD_ACTION_ID ?? process.env.NEXT_PUBLIC_WORLD_ACTION_ID ?? 'verify-author';
const DEMO_MODE =
  process.env.DEMO_MODE === 'true' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { proof, wallet_address } = body;

  if (!proof || !wallet_address) {
    return NextResponse.json(
      { error: 'proof and wallet_address are required' },
      { status: 400 }
    );
  }

  const { nullifier_hash, merkle_root, proof: zkProof, verification_level } = proof;

  if (!WORLD_APP_ID) {
    if (DEMO_MODE) {
      return NextResponse.json({
        success: true,
        demo: true,
        nullifier_hash: '0x' + 'a'.repeat(64),
      });
    }
    return NextResponse.json({ error: 'WORLD_APP_ID not configured' }, { status: 500 });
  }

  const verifyRes = await fetch(
    `https://developer.world.org/api/v4/verify/${WORLD_APP_ID}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nullifier_hash,
        merkle_root,
        proof: zkProof,
        verification_level: verification_level ?? 'orb',
        action: WORLD_ACTION_ID,
        signal: wallet_address.toLowerCase(),
      }),
    }
  );

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    console.error('[verify] World ID rejected:', err);

    if (DEMO_MODE) {
      return NextResponse.json({
        success: true,
        demo: true,
        nullifier_hash: '0x' + 'a'.repeat(64),
        upstreamError: err,
      });
    }

    return NextResponse.json(
      { success: false, error: 'World ID verification failed', detail: err },
      { status: 400 }
    );
  }

  const data = await verifyRes.json();
  return NextResponse.json({ success: true, nullifier_hash: data.nullifier_hash });
}
