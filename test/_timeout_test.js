import { test } from '@substrate-system/tapzero'

// This is a fixture test that takes 6 seconds to complete
// It will be bundled and passed to the CLI for timeout testing
test('long running test', (t) => {
    console.log('# Test starting - will run for 6 seconds')

    return new Promise(resolve => {
        // Emit a heartbeat so the harness auto-finish (a short quiet period)
        // does not fire during the long, otherwise-silent wait. A real
        // long-running test would normally be producing output of its own.
        const heartbeat = setInterval(() => {
            console.log('# still running')
        }, 200)

        setTimeout(() => {
            clearInterval(heartbeat)
            t.ok(true, 'long running test completed')
            // Explicitly mark tests as finished for the test runner
            if (typeof window !== 'undefined') {
                window.testsFinished = true
            }
            resolve()
        }, 6000)
    })
})
