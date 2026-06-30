// Get timeout from URL parameters, default to 5000ms
const urlParams = new URLSearchParams(window.location.search)
const timeoutMs = parseInt(urlParams.get('timeout'), 10) || 5000
const isCustomTimeout = urlParams.get('custom') === 'true'
const noAutoFinish = urlParams.get('noAutoFinish') === 'true'

// For custom timeouts, keep the auto-finish close to the requested timeout
// instead of forcing a fixed 2-3 second cap.
let autoFinishDelay
if (noAutoFinish) {
    // If auto-finish is disabled, we still need some fallback
    // Use the full timeout as the delay
    autoFinishDelay = timeoutMs
} else if (isCustomTimeout) {
    // Use 80% of the provided timeout and keep a small buffer so the
    // outer wait timeout does not win the race.
    autoFinishDelay = Math.max(
        1000,
        Math.min(timeoutMs - 250, Math.floor(timeoutMs * 0.8))
    )
} else {
    // Use a reasonable auto-finish delay for default timeout
    autoFinishDelay = Math.max(500, Math.min(5000, timeoutMs * 0.2))
}

// Set up test completion detection
let hasFinished = false
let finishTimer = null

function markTestsFinished () {
    if (!hasFinished) {
        hasFinished = true
        window.testsFinished = true
    }
}

// Auto-finish tests after a short delay if no explicit completion
function resetFinishTimer () {
    if (finishTimer) clearTimeout(finishTimer)
    if (!noAutoFinish) {
        finishTimer = setTimeout(() => {
            if (!hasFinished && !window.testsFinished) {
                console.log(
                    'Tests auto-finished (no explicit completion detected)'
                )
                markTestsFinished()
            }
        }, autoFinishDelay)
    }
}

// Override console methods to detect test completion
const originalConsole = { ...console }
let lastLogTime = Date.now()

console.log = function (...args) {
    originalConsole.log(...args)
    lastLogTime = Date.now()
    // Only reset timer if we haven't seen logs for a while and auto-finish
    // is enabled
    if (!hasFinished && !noAutoFinish) {
        if (finishTimer) clearTimeout(finishTimer)
        finishTimer = setTimeout(() => {
            if (
                !hasFinished && !window.testsFinished &&
                (Date.now() - lastLogTime) > 500
            ) {
                console.log(
                    'Tests auto-finished (no explicit completion detected)'
                )
                markTestsFinished()
            }
        }, autoFinishDelay)
    }
}
console.error = function (...args) {
    originalConsole.error(...args)
    lastLogTime = Date.now()
}

// Common test completion patterns
window.addEventListener('load', () => {
    resetFinishTimer()
})

// Handle unhandled errors
window.addEventListener('error', (event) => {
    console.error('Unhandled error:', event.error)
    window.testsFailed = true
    markTestsFinished()
})

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason)
    window.testsFailed = true
    markTestsFinished()
})

// Also catch console.error calls for additional error detection
const originalError = console.error
console.error = function (...args) {
    originalError(...args)
    lastLogTime = Date.now()

    // Mark tests as failed for console.error calls
    // This catches errors that are logged but not thrown as unhandled errors
    window.testsFailed = true
}

// Load and execute test code as ES module
import('./test-bundle.js')
    .then(() => {
        // Final fallback - mark as finished after code execution
        resetFinishTimer()
    })
    .catch(error => {
        console.error('Error loading or executing test code:', error)
        window.testsFailed = true
        markTestsFinished()
    })
