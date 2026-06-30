// This module is the in-page test harness. It is served VERBATIM at runtime
// (GET /__tapout/harness.js -- see src/index.ts) and is placed in dist/ by the
// "cp" at the end of the "build-esm" script in package.json. It is NOT compiled
// or bundled: esbuild's "src/*.ts" glob skips .js/.html assets. Two invariants
// follow. Keep this file plain, lint-clean ES that runs as-is in the browser
// (no TypeScript, no build-time transforms) -- rewriting it in TS would orphan
// the cp and ship a stale dist/. And any other asset served verbatim from src/
// must be added to that same cp, or it will be missing from dist/.

// Get timeout from URL parameters, default to 5000ms
const urlParams = new URLSearchParams(window.location.search)
const timeoutMs = parseInt(urlParams.get('timeout'), 10) || 5000
const noAutoFinish = urlParams.get('noAutoFinish') === 'true'

// Auto-finish is only a FALLBACK for tests that never signal completion. It
// fires after a short quiet period (no output) following the last log. Keep
// that period short and bounded, and deliberately INDEPENDENT of the overall
// --timeout (which only bounds how long the whole run may take). Tying it to
// the timeout -- e.g. 80% of it -- meant a finished test that forgot to signal
// idled for most of a long timeout before the run ended. A test that runs long
// while silent must set window.testsFinished or emit periodic output to stay
// alive past this window.
let autoFinishDelay
if (noAutoFinish) {
    // If auto-finish is disabled, we still need some fallback
    // Use the full timeout as the delay
    autoFinishDelay = timeoutMs
} else {
    autoFinishDelay = Math.max(500, Math.min(3000, Math.floor(timeoutMs * 0.2)))
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
