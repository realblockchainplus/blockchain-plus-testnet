import * as d from 'debug';

const err = d('bcp:ERROR');
const warning = d('bcp:WARNING');
const debug = d('bcp:DEBUG');
const info = d('bcp:INFO');
const timer = d('bcp:TIMER');

// zeit deployment logs dont seem to work with debug

export { err, warning, debug, info, timer };
