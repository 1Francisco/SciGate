import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Resolve .env from root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { createPublicClient, http, formatEther, formatUnits, parseAbi } from 'viem';

// --- CONFIGURACIÓN ---
const RPC_URL = process.env.WORLD_CHAIN_RPC || 'https://rpc.worldchain.dev';
const USDC_CONTRACT = '0x79A02482A880bCe3F13E09da970dC34dB4cD24D1';
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

// Dirección del agente (o la llave privada del .env)
const AGENT_KEY = process.env.RAG_AGENT_PRIVATE_KEY;
const AGENT_ADDRESS = process.env.AGENT_ADDRESS; // Puedes poner una dirección manual aquí si quieres

async function checkBalance() {
  const client = createPublicClient({ 
    transport: http(RPC_URL) 
  });

  let targetAddress = AGENT_ADDRESS;

  if (AGENT_KEY && !targetAddress) {
    try {
      const { privateKeyToAccount } = await import('viem/accounts');
      const account = privateKeyToAccount(AGENT_KEY as `0x${string}`);
      targetAddress = account.address;
    } catch (e) {
      console.log('❌ Error: La PRIVATE_KEY en el .env no es válida.');
      console.log('💡 Aquí tienes una IDENTIDAD NUEVA que puedes usar:');
      
      const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts');
      const newPk = generatePrivateKey();
      const newAcc = privateKeyToAccount(newPk);
      
      console.log('--------------------------------------------------');
      console.log(`RAG_AGENT_PRIVATE_KEY=${newPk}`);
      console.log(`ADDRESS (Fondea esta cuenta): ${newAcc.address}`);
      console.log('--------------------------------------------------');
      return;
    }
  }

  if (!targetAddress) {
    console.error('❌ Error: No se encontró ADDRESS ni PRIVATE_KEY en el .env');
    return;
  }

  console.log(`\n🔍 Verificando balances para: ${targetAddress}`);
  console.log(`🌐 Red: World Chain Mainnet (ID: 480)`);
  console.log('--------------------------------------------------');

  try {
    // 1. Check ETH (Gas)
    const ethBalance = await client.getBalance({ address: targetAddress as `0x${string}` });
    console.log(`💎 ETH (Gas):  ${formatEther(ethBalance)} ETH`);

    // 2. Check USDC
    const usdcBalance = await client.readContract({
      address: USDC_CONTRACT as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [targetAddress as `0x${string}`],
    });
    console.log(`💵 USDC:       $${formatUnits(usdcBalance, 6)} USDC`);

    console.log('--------------------------------------------------');
    
    if (ethBalance === 0n) {
      console.log('⚠️ AVISO: El agente no tiene ETH para pagar el GAS.');
    }
    if (usdcBalance < 10000n) {
      console.log('⚠️ AVISO: El saldo de USDC es muy bajo para comprar papers.');
    }

  } catch (error: any) {
    console.error('❌ Error al consultar la red:', error.message);
  }
}

checkBalance();
