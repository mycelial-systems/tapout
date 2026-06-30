// Example: Complex test with async operations and multiple assertions
// This demonstrates more realistic testing scenarios
console.log('TAP version 13')
console.log('1..3')

// Test 1: Simple assertion
const result1 = 2 + 2
if (result1 === 4) {
    console.log('ok 1 - addition works')
} else {
    console.log('not ok 1 - addition failed')
}

// Test 2: Async test
Promise.resolve(42).then(result => {
    if (result === 42) {
        console.log('ok 2 - async test works')
    } else {
        console.log('not ok 2 - async test failed')
    }
    
    // Test 3: Complex object test
    const obj = { a: 1, b: 2 }
    if (obj.a === 1 && obj.b === 2) {
        console.log('ok 3 - object test works')
    } else {
        console.log('not ok 3 - object test failed')
    }

    // Signal completion after the async assertions have logged, so the run
    // finishes promptly instead of waiting out the auto-finish delay.
    window.testsFinished = true
})
