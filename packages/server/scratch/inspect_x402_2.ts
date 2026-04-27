import { x402ResourceServer } from '@x402/hono';
import { HTTPFacilitatorClient } from '@x402/core/http';

const facilitatorClient = new HTTPFacilitatorClient({ url: 'http://localhost' });
const resourceServer = new x402ResourceServer(facilitatorClient);

console.log('--- verifyPayment Signature ---');
console.log(resourceServer.verifyPayment.toString().split('\n')[0]);
