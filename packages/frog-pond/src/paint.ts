// The bank painter's worker side, for builds that start their own script as
// the worker (the single-file standalone): call serveBankRequests() when
// there's no document. See frog-bank-paint.ts and frog-bank-worker-factory.ts.
export { serveBankRequests } from './frog-bank-paint';
