console.log('TAP version 13')
console.log('1..1')
const el = document.querySelector('my-greeting')
if (el && el.textContent === 'Hello, world') {
    console.log('ok 1 - sibling module upgraded markup')
} else {
    console.log('not ok 1 - sibling module did not upgrade markup')
}
window.testsFinished = true
