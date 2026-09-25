import { serveBankRequests } from './frog-bank-paint';

// The worker that paints the bank off the page's main thread (see
// frog-bank-layer.ts and frog-bank-worker-factory.ts).
serveBankRequests();
