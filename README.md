# DOMPickle

A small library that can produce a JSON compatible serialization of a DOM tree which can then be reinflated. Useful for creating static copies of applications to reproduce layout or style bugs, or create test case reductions.

### Features:
- Shadow DOM v0 and v1.
- HTML imports.
- Standards and quirks mode.
- Strips most script and side effect causing things.
- Requires ES6+, supports Chrome 56+.

```js
// The serialization format can be stringified into JSON or sent over
// postMessage. It's both JSON and structured clone compatible.
let data = DOMPickle.serialize(node);
// worker.postMessage(data);
// localStorage.setItem("pickle", JSON.stringify(data));

// We can reinflate it into a real DOM tree as well.
let newNode = DOMPickle.inflate(data);
```
## Support
Currently tested on: DevTools UI, Google Music.

## Crazy future ideas

May also be useful for experimenting with creating dom inside workers, though no API exists currently to create the serialization format from inside a worker.

# WARNING: This is not security hardened, don't use it to inflate untrusted content!
