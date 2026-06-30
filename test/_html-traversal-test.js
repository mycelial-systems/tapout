console.log('TAP version 13')
console.log('1..1')
// Encoded slash (%2f) survives URL normalization; decodes server-side to
// ../package.json, which escapes the fixture root and must be rejected.
const res = await fetch('/..%2fpackage.json')
if (res.status === 404) {
    console.log('ok 1 - path traversal returns 404')
} else {
    console.log('not ok 1 - path traversal not blocked (status ' +
        res.status + ')')
}
window.testsFinished = true
