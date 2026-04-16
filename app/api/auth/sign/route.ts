import { NextRequest, NextResponse } from 'next/server';
import { signRequest } from '@worldcoin/idkit/signing';

// Backend route for World ID 4.0 RP Signatures
export async function POST(req: NextRequest) {
  try {
    const { action, signal, app_id } = await req.json();

    if (!action || !app_id) {
      return NextResponse.json({ error: 'Action and App ID are required' }, { status: 400 });
    }

    // SIGNING_KEY logic
    const SIGNING_KEY = process.env.WORLD_ID_SIGNING_KEY || 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    
    // RP_ID logic: In v4, rp_id typically matches the app_id but with rp_ prefix if using new standards
    // or just the app_id without the app_ prefix. 
    // For staging/backward compatibility, the Developer Portal usually provides a specific RP ID.
    const RP_ID = process.env.NEXT_PUBLIC_WORLD_RP_ID || app_id.replace('app_', 'rp_');

    console.log(`[SIGN] Generating signature for Action: ${action}, App: ${app_id}, RP: ${RP_ID}`);

    const { sig, nonce, createdAt, expiresAt } = signRequest({
      action: action,
      signingKeyHex: SIGNING_KEY,
    });

    return NextResponse.json({
      success: true,
      rp_context: {
        rp_id: RP_ID,
        nonce,
        created_at: createdAt,
        expires_at: expiresAt,
        signature: sig,
      }
    });
  } catch (error: any) {
    console.error('Signing Error:', error);
    return NextResponse.json({ error: 'Failed to sign request', detail: error.message }, { status: 500 });
  }
}
