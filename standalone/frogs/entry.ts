import { mountFrogScene } from '@animal-farm/frog-pond';
import { serveBankRequests } from '@animal-farm/frog-pond/paint';
import { startFrogPage } from '../../studies/frogs/page';

// The single-file standalone page: studies/frogs/index.html with its CSS
// inlined, no stills, and this script (see scripts/build-standalone.mjs).
//
// This one script is also the bank painter's worker: the page starts it
// again from its own text, and with no document around it only answers
// bake requests.
if (typeof document === 'undefined') serveBankRequests();
else startFrogPage(async (container, options) => mountFrogScene(container, options));
