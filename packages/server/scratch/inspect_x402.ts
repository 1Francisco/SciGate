import { x402ResourceServer } from '@x402/hono';
import { HTTPFacilitatorClient } from '@x402/core/http';

const facilitatorClient = new HTTPFacilitatorClient({ url: 'http://localhost' });
const resourceServer = new x402ResourceServer(facilitatorClient);

console.log('--- x402ResourceServer Methods ---');
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(resourceServer)));
console.log(Object.keys(resourceServer));
