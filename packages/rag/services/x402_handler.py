import os
import asyncio
from eth_account import Account
from x402 import x402Client
from x402.mechanisms.evm.exact import ExactEvmScheme
from x402.signers.evm.account import LocalAccountSigner
from dotenv import load_dotenv

load_dotenv()

class AutonomousX402Handler:
    """
    Handles autonomous payments using the x402 protocol for Python clients.
    Uses the RAG_AGENT_PRIVATE_KEY to sign transactions on World Chain.
    """
    def __init__(self):
        private_key = os.getenv("RAG_AGENT_PRIVATE_KEY") or os.getenv("PRIVATE_KEY")
        if not private_key:
            raise ValueError(
                "❌ MISSING AGENT PRIVATE KEY: RAG_AGENT_PRIVATE_KEY is not defined in .env. "
                "The researcher agent needs a wallet with funds to buy context autonomously."
            )
        
        # Initialize the EVM account and signer
        self.account = Account.from_key(private_key)
        self.signer = LocalAccountSigner(self.account)
        
        # Initialize x402 client
        self.client = x402Client()
        
        # Register EVM scheme for World Chain Mainnet (eip155:480)
        # We use a wildcard eip155:* or specific 480
        self.client.register("eip155:480", ExactEvmScheme(signer=self.signer))
        self.client.register("eip155:4801", ExactEvmScheme(signer=self.signer)) # Also support Sepolia for testing

    async def get(self, url: str, headers: dict = None):
        """Perform an autonomous GET request with x402 support."""
        return await self.client.get(url, headers=headers)

    async def post(self, url: str, json: dict = None, headers: dict = None):
        """Perform an autonomous POST request with x402 support."""
        return await self.client.post(url, json=json, headers=headers)

# Singleton instance
x402_handler = AutonomousX402Handler()
