import * as d from 'debug';
import * as minimist from 'minimist';

const argv = minimist(process.argv.slice(2));
const isSeed = argv.s === 'true';

const err = d('bcp:ERROR');
const warning = d('bcp:WARNING');
const debug = d('bcp:DEBUG');
const info = d('bcp:INFO');

// zeit deployment logs dont seem to work with debug
if (isSeed) {
  console.log('Binding debug stuff to console');
  err.log = console.log.bind(console);
  warning.log = console.log.bind(console);
  debug.log = console.log.bind(console);
  info.log = console.log.bind(console);
}

export { err, warning, debug, info };
