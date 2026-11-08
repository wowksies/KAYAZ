   
                                                                              
                                                                             
  
                                       
   
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const code = fs.readFileSync(path.join(root, 'assets/panel.js'), 'utf8');

const handler = () => {};
const list = () => [];
function el() {
  return {
    style: {},
    dataset: {},
    classList: { add: handler, remove: handler, toggle: handler, contains: () => false },
    value: '',
    textContent: '',
    innerHTML: '',
    src: '',
    hidden: false,
    files: [],
    checked: false,
    addEventListener: handler,
    removeEventListener: handler,
    removeAttribute: handler,
    setAttribute: handler,
    getAttribute: () => '',
    appendChild: handler,
    removeChild: handler,
    focus: handler,
    click: handler,
    querySelectorAll: list,
    querySelector: () => null
  };
}

const body = Object.assign(el(), { getAttribute: () => 'admin' });
const documentStub = {
  body,
  getElementById: () => null,
  querySelectorAll: list,
  querySelector: () => null,
  createElement: () => el(),
  addEventListener: handler
};

const windowStub = { SEED_GAMES: [] };
const locationStub = { href: '', reload: handler };
const navigatorStub = { clipboard: { writeText: () => Promise.resolve() } };
const fetchStub = () => Promise.reject(new Error('offline smoke test'));

const run = new Function('window', 'document', 'location', 'navigator', 'fetch', 'setTimeout', 'confirm', code);

try {
  run(windowStub, documentStub, locationStub, navigatorStub, fetchStub, handler, () => true);
} catch (error) {
  console.error('panel bundle threw on load:', error && error.message);
  process.exit(1);
}

console.log('panel bundle executes cleanly');
