// Regression test for a crash on page-side console calls whose Playwright
// message type is not a Node `console` method name.
//
// Playwright reports `console.warn` as type "warning" (not "warn") and
// `console.group` as "startGroup", neither of which exist on Node's
// `console`. Forwarding them by name used to throw and crash the run.
console.log('TAP version 13')
console.log('1..1')
console.warn('a warning emitted from the page')
console.group('a group emitted from the page')
console.log('ok 1 - run completes despite page-side console.warn')
