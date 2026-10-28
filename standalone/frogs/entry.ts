import { mountFrogScene } from '@critters/frog-pond';
import { startFrogPage } from '../../studies/frogs/page';

// The single-file standalone page: studies/frogs/index.html with its CSS
// inlined, no stills, and this script (see scripts/build-standalone.mjs).
startFrogPage(async (container, options) => mountFrogScene(container, options));
