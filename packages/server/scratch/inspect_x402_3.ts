import { x402ResourceServer, x402HTTPResourceServer } from '@x402/hono';
import { HTTPFacilitatorClient } from '@x402/core/http';

const facilitatorClient = new HTTPFacilitatorClient({ url: 'http://localhost' });
const resourceServer = new x402ResourceServer(facilitatorClient);
const httpServer = new x402HTTPResourceServer(resourceServer, {});

console.log('--- x402HTTPResourceServer Methods ---');
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(httpServer)));
