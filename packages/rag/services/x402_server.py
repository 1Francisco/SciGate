import os
import time
from fastapi import Request, HTTPException
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

# World Chain Mainnet (Chain ID: 480)
WORLD_CHAIN_RPC = os.getenv("WORLD_CHAIN_RPC", "https://rpc.worldchain.dev")
USDC_ADDRESS = "0x79A02482A880bCe3F13E09da970dC34dB4cD24D1" # Native USDC on World Chain
RECIPIENT = os.getenv("PAY_TO_ADDRESS", "0x2eb655c6828d633e70c82b3b7eccac731d9b8ba7")
QUERY_PRICE_USDC = 10000 # 0.01 USDC (6 decimals)

w3 = Web3(Web3.HTTPProvider(WORLD_CHAIN_RPC))

# Simple in-memory cache to prevent replay attacks (transaction hash reuse)
# In production, use Redis or a Database.
used_hashes = set()

def verify_usdc_payment(tx_hash: str) -> bool:
    """
    Verifies that a transaction hash represents a valid USDC transfer 
    of the correct amount to our RECIPIENT on World Chain.
    """
    if tx_hash in used_hashes:
        print(f"❌ x402: Replay attack detected. Hash {tx_hash} already used.")
        return False

    try:
        # 1. Fetch transaction receipt
        receipt = w3.eth.get_transaction_receipt(tx_hash)
        if not receipt or receipt['status'] != 1:
            print(f"❌ x402: Transaction {tx_hash} failed or not found.")
            return False

        # 2. Extract logs (specifically ERC-20 Transfer)
        # Standard ERC-20 Transfer Topic: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
        transfer_topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        
        found_valid_transfer = False
        for log in receipt['logs']:
            # Check if it's USDC contract and the Transfer event
            if log['address'].lower() == USDC_ADDRESS.lower() and log['topics'][0].hex() == transfer_topic:
                # Log topics: [Topic, From, To]
                # Log data: [Value]
                to_address = "0x" + log['topics'][2].hex()[-40:]
                amount = int(log['data'].hex(), 16)
                
                if to_address.lower() == RECIPIENT.lower() and amount >= QUERY_PRICE_USDC:
                    found_valid_transfer = True
                    break
        
        if found_valid_transfer:
            used_hashes.add(tx_hash)
            return True
        
        print(f"❌ x402: No valid USDC transfer found in {tx_hash} for amount {QUERY_PRICE_USDC}")
        return False

    except Exception as e:
        print(f"⚠️ x402 Verification error: {str(e)}")
        return False

async def x402_gate(request: Request):
    """
    Dependency for FastAPI that enforces the x402 protocol.
    """
    # 1. Check for payment proof header
    tx_hash = request.headers.get("x-payment-proof")
    
    # 2. Challenge if header is missing or payment is invalid
    if not tx_hash or not verify_usdc_payment(tx_hash):
        # Generate the Payment-Required challenge header
        challenge = f"chain_id=480; asset={USDC_ADDRESS}; amount={QUERY_PRICE_USDC}; recipient={RECIPIENT};"
        
        raise HTTPException(
            status_code=402,
            detail="Payment Required",
            headers={"Payment-Required": challenge}
        )
    
    return True
