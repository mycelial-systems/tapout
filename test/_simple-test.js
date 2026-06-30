// Example: Simple passing test using TAP format
// This demonstrates basic TAP output that should pass
console.log('TAP version 13')
console.log('1..1')
console.log('ok 1 - simple test')

// Signal completion explicitly so the run finishes as soon as the test is
// done, instead of waiting out the harness auto-finish delay (which is a
// fraction of --timeout and leaves little headroom on slow browsers).
window.testsFinished = true
