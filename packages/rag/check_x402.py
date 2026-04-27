
import inspect
from x402.mechanisms.evm.exact import ExactEvmScheme
from x402.mechanisms.svm.exact import ExactSvmScheme

print("--- ExactEvmScheme Init Signature ---")
print(inspect.signature(ExactEvmScheme.__init__))

print("\n--- ExactSvmScheme Init Signature ---")
print(inspect.signature(ExactSvmScheme.__init__))

try:
    from x402.mechanisms.svm.utils import normalize_network
    print("\n--- Solana Network Normalization Test ---")
    networks = ["solana:mainnet", "solana:5eykt4UsFv8P8NJdTREpY1vzqAQZSSfL"]
    for n in networks:
        try:
            print(f"{n} -> {normalize_network(n)}")
        except Exception as e:
            print(f"{n} -> ERROR: {e}")
except:
    print("\nNo normalize_network found")
