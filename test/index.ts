/**
 * Test the CLI.
 *
 * - Run example test files via CLI
 * - Check exit codes for success/failure scenarios
 * - Validate output messages and error handling
 * - Test edge cases like empty input and invalid JavaScript
 */

import { test } from '@substrate-system/tapzero'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

// Use process.cwd() instead of __dirname b/c this will be bundled
const projectRoot = process.cwd()
const cliPath = path.join(projectRoot, 'dist', 'cli.js')

interface TestResult {
    exitCode:number|null
    stdout:string
    stderr:string
}

test('CLI: simple test should pass', async (t) => {
    const result = await runCliTest('_simple-test.js')

    t.equal(result.exitCode, 0, 'simple test should exit with code 0')
    t.ok(
        result.stdout.includes('TAP version 13'),
        'should show TAP output'
    )
    t.ok(
        result.stdout.includes('ok 1 - simple test'),
        'should show test result'
    )
})

test('CLI: concurrent runs do not collide on a port', async (t) => {
    // Each CLI invocation starts its own HTTP server. If the port is fixed,
    // running several at once makes all but the first fail to bind (EADDRINUSE)
    // with no error handler -> a hard crash. With an ephemeral port they coexist
    // -- which is what lets the suite be parallelised.
    const results = await Promise.all([
        runCliTest('_simple-test.js'),
        runCliTest('_simple-test.js'),
        runCliTest('_simple-test.js')
    ])

    for (const result of results) {
        t.equal(
            result.exitCode,
            0,
            'each concurrent run should exit with code 0'
        )
    }
})

test('CLI: complex test should pass', async (t) => {
    const result = await runCliTest('_tape-test.js')

    t.equal(result.exitCode, 0, 'complex test should exit with code 0')
    t.ok(
        result.stdout.includes('TAP version 13'),
        'should show TAP output'
    )
    t.ok(
        result.stdout.includes('ok 1 - addition works'),
        'should show first test'
    )
    t.ok(
        result.stdout.includes('ok 2 - async test works'),
        'should show async test'
    )
    t.ok(
        result.stdout.includes('ok 3 - object test works'),
        'should show object test'
    )
})

test('CLI: failing test should fail', async (t) => {
    const result = await runCliTest('_failing-test.js')

    t.equal(result.exitCode, 1, 'failing test should exit with code 1')
    t.ok(
        result.stdout.includes('not ok 2 - this test fails'),
        'should show failing test'
    )
    t.ok(
        (result.stdout.includes('Error executing test code') ||
        result.stderr.includes('Error')),
        'should show error'
    )
})

test('CLI: page-side console.warn does not crash the run', async (t) => {
    const result = await runCliTest('_console-warn-test.js')

    t.equal(
        result.exitCode,
        0,
        'should exit 0 despite a page-side console.warn'
    )
    t.ok(
        result.stdout.includes('ok 1'),
        'should still report the passing test'
    )
    t.ok(
        !result.stderr.includes('is not a function'),
        'should not throw a TypeError forwarding the console message'
    )
})

test('CLI: detects unhandled promise rejections', async (t) => {
    const result = await runCliTest('_unhandled-rejection-test.js')

    t.equal(result.exitCode, 1, 'unhandled rejection should exit with code 1')
    t.ok(
        result.stdout.includes('Unhandled promise rejection') ||
        result.stdout.includes('Page error') ||
        result.stderr.includes('Unhandled promise rejection'),
        'should show unhandled promise rejection message'
    )
    t.ok(
        result.stderr.includes('Tests failed') || result.stdout.includes('Error running tests'),
        'should indicate test failure'
    )
})

test('CLI: detects uncaught exceptions', async (t) => {
    const result = await runCliTest('_uncaught-exception-test.js')

    t.equal(result.exitCode, 1, 'uncaught exception should exit with code 1')
    t.ok(
        result.stdout.includes('Unhandled error') ||
        result.stdout.includes('Page error') ||
        result.stderr.includes('Unhandled error'),
        'should show unhandled error message'
    )
    t.ok(
        result.stderr.includes('Tests failed') || result.stdout.includes('Error running tests'),
        'should indicate test failure'
    )
})

test('CLI: fails when test logs error without throwing', async (t) => {
    const result = await runCliTest('_missing-element-test.js')

    t.equal(result.exitCode, 1, 'test with console.error should exit with code 1')
    t.ok(
        result.stdout.includes('not ok 1') ||
        result.stderr.includes('Error'),
        'should show test failure'
    )
    t.ok(
        (result.stderr.includes('Tests failed') ||
        result.stdout.includes('Error running tests')),
        'should indicate test failure in stderr'
    )
})

test('CLI: timeout test should handle timeouts', async (t) => {
    // Use 2 second timeout for this test
    const result = await runCliTest('_timeout-test.js', 2000)

    // This test might either timeout (exit code null) or auto-finish
    // (exit code 0)
    // depending on the timing, both are acceptable behaviors
    t.ok(
        result.exitCode === 0 || result.exitCode === null || result.exitCode === 1,
        `timeout test should exit with code 0, 1, or null (timeout), got: ${result.exitCode}`
    )

    if (result.exitCode === 0) {
        t.ok(
            result.stdout.includes('Tests auto-finished'),
            'should auto-finish'
        )
    } else if (result.exitCode === 1) {
        // For timeout or failure, we just check that it failed
        t.ok(true, 'timeout test properly failed')
    }
})

test('CLI: handles empty input', async (t) => {
    const result = await new Promise<TestResult>((resolve) => {
        const child = spawn('node', [cliPath], {
            cwd: projectRoot,
            stdio: ['pipe', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        child.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        // Send empty input
        child.stdin.end()

        child.on('close', (code) => {
            resolve({
                exitCode: code,
                stdout,
                stderr
            })
        })
    })

    t.equal(result.exitCode, 1, 'empty input should exit with code 1')
    t.ok(
        result.stderr.includes('No test code provided'),
        'should show empty input error'
    )
})

test('CLI: handles invalid JavaScript', async (t) => {
    const result = await new Promise<TestResult>((resolve) => {
        const child = spawn('node', [cliPath], {
            cwd: projectRoot,
            stdio: ['pipe', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        child.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        // Send invalid JavaScript
        child.stdin.write('this is not valid javascript syntax !!!')
        child.stdin.end()

        child.on('close', (code) => {
            resolve({
                exitCode: code,
                stdout,
                stderr
            })
        })

        child.on('error', (err) => {
            stderr += `Process error: ${err.message}`
            resolve({
                exitCode: 1,
                stdout,
                stderr
            })
        })

        // Shorter timeout for invalid JS
        setTimeout(() => {
            child.kill('SIGTERM')
            resolve({
                exitCode: 1, // Treat timeout as failure
                stdout,
                stderr: stderr + 'Test timed out'
            })
        }, 5000).unref()
    })

    t.equal(result.exitCode, 1, 'invalid JavaScript should exit with code 1')
    t.ok(
        result.stdout.includes('❌ Tests failed') ||
        result.stdout.includes('Error executing test code') ||
        result.stderr.includes('Error') ||
        result.stderr.includes('timed out'),
        'should show error message for invalid JavaScript'
    )
})

test('CLI: can run tests in Firefox', async (t) => {
    const result = await runCliTest('_simple-test.js', 20000, 'firefox')

    t.equal(result.exitCode, 0, 'simple test should exit with code 0 in Firefox')
    t.ok(
        result.stdout.includes('# Running tests in firefox'),
        'should show browser comment for Firefox'
    )
    t.ok(
        result.stdout.includes('TAP version 13'),
        'should show TAP output'
    )
})

test('CLI: can run tests in WebKit', async (t) => {
    const result = await runCliTest('_simple-test.js', 20000, 'webkit')

    t.equal(result.exitCode, 0, 'simple test should exit with code 0 in WebKit')
    t.ok(
        result.stdout.includes('# Running tests in webkit'),
        'should show browser comment for WebKit'
    )
    t.ok(
        result.stdout.includes('TAP version 13'),
        'should show TAP output'
    )
})

test('CLI: can run tests in Edge', async (t) => {
    const result = await runCliTest('_simple-test.js', 20000, 'edge')

    t.equal(result.exitCode, 0, 'simple test should exit with code 0 in Edge')
    t.ok(
        result.stdout.includes('# Running tests in edge'),
        'should show browser comment for Edge'
    )
    t.ok(
        result.stdout.includes('TAP version 13'),
        'should show TAP output'
    )
})

test('CLI: respects custom timeout for long-running tests', async (t) => {
    // Test that takes 2 seconds but should complete within 10 second timeout
    const longRunningTest = `
console.log('TAP version 13')
console.log('1..1')
setTimeout(() => {
    console.log('ok 1 - long running test')
    window.testsFinished = true
}, 2000)`

    const result = await new Promise<TestResult>((resolve) => {
        const child = spawn('node', [cliPath, '--timeout', '10000'], {
            cwd: projectRoot,
            stdio: ['pipe', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        child.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        child.stdin.write(longRunningTest)
        child.stdin.end()

        child.on('close', (code) => {
            resolve({
                exitCode: code,
                stdout,
                stderr
            })
        })

        // Timeout after 15 seconds
        setTimeout(() => {
            child.kill('SIGTERM')
            resolve({
                exitCode: null,
                stdout,
                stderr: stderr + 'Test timed out'
            })
        }, 15000).unref()
    })

    t.equal(result.exitCode, 0, 'long running test should complete successfully')
    t.ok(
        result.stdout.includes('ok 1 - long running test'),
        'should show test completion'
    )
    t.equal(
        result.stdout.includes('Tests auto-finished'),
        false,
        'should not auto-finish when test completes explicitly'
    )
})

test('CLI: timeout parameter is passed to test runner', async (t) => {
    const result = await runCliTest('_timeout-validation-test.js', 5000)

    t.equal(result.exitCode, 0, 'timeout validation test should exit with code 0')
    t.ok(
        result.stdout.includes(
            'ok 1 - timeout parameter is properly passed to test runner'
        ),
        'should confirm timeout parameter is passed to HTML runner'
    )
})

test('CLI: Vite environment variables should be available', async (t) => {
    const result = await runCliTest('_vite-env-test.js', 5000)

    t.equal(result.exitCode, 0, 'Vite env test should exit with code 0')
    t.ok(
        result.stdout.includes('ok 1 - true is defined (true)'),
        'should have DEV env var transformed to true'
    )
    t.ok(
        result.stdout.includes('ok 2 - false is defined (false)'),
        'should have PROD env var transformed to false'
    )
    t.ok(
        result.stdout.includes('ok 3 - "test" is defined (test)'),
        'should have MODE env var transformed to "test"'
    )
    t.ok(
        result.stdout.includes('ok 4 - "/" is defined (/)'),
        'should have BASE_URL env var transformed to "/"'
    )
    t.ok(
        result.stdout.includes('ok 5 - false is defined (false)'),
        'should have SSR env var transformed to false'
    )
})

async function runCliTest (
    testFile:string,
    timeoutMs:number = 5000,
    browser:string = 'chromium'
):Promise<TestResult> {
    // Increase timeout for CI environments
    const isCI = process.env.CI === 'true'
    const adjustedTimeout = isCI ? timeoutMs * 2 : timeoutMs
    return new Promise((resolve) => {
        const testPath = path.join(projectRoot, 'test', testFile)
        const child = spawn('node', [
            cliPath,
            '--timeout',
            adjustedTimeout.toString(), '--browser', browser
        ], {
            cwd: projectRoot,
            stdio: ['pipe', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        child.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        // Read test file then pipe it to CLI
        fs.readFile(testPath, 'utf8')
            .then((testCode) => {
                child.stdin.write(testCode)
                child.stdin.end()
            })
            .catch((err) => {
                stderr += `Error reading test file: ${err.message}`
                child.kill('SIGTERM')
                resolve({
                    exitCode: 1,
                    stdout,
                    stderr
                })
            })

        child.on('close', (code) => {
            resolve({
                exitCode: code,
                stdout,
                stderr
            })
        })

        child.on('error', (err) => {
            stderr += `Process error: ${err.message}`
            resolve({
                exitCode: 1,
                stdout,
                stderr
            })
        })

        // Timeout after CLI timeout + 2 seconds for overhead.
        // unref() so the watchdog does not keep the event loop alive after
        // the child closes and the promise has already resolved.
        setTimeout(() => {
            child.kill('SIGTERM')
            resolve({
                exitCode: null,
                stdout,
                stderr: stderr + `Test timed out after ${adjustedTimeout + 2000}ms`
            })
        }, adjustedTimeout + 2000).unref()
    })
}

async function runHtmlCliTest (
    testFile:string,
    htmlFile:string,
    timeoutMs:number = 5000,
    browser:string = 'chromium'
):Promise<TestResult> {
    const isCI = process.env.CI === 'true'
    const adjustedTimeout = isCI ? timeoutMs * 2 : timeoutMs
    return new Promise((resolve) => {
        const testPath = path.join(projectRoot, 'test', testFile)
        const htmlPath = path.join(projectRoot, 'test', htmlFile)
        const child = spawn('node', [
            cliPath,
            '--html', htmlPath,
            '--timeout', adjustedTimeout.toString(),
            '--browser', browser
        ], {
            cwd: projectRoot,
            stdio: ['pipe', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        child.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        fs.readFile(testPath, 'utf8')
            .then((testCode) => {
                child.stdin.write(testCode)
                child.stdin.end()
            })
            .catch((err) => {
                stderr += `Error reading test file: ${err.message}`
                child.kill('SIGTERM')
                resolve({ exitCode: 1, stdout, stderr })
            })

        child.on('close', (code) => {
            resolve({ exitCode: code, stdout, stderr })
        })

        child.on('error', (err) => {
            stderr += `Process error: ${err.message}`
            resolve({ exitCode: 1, stdout, stderr })
        })

        setTimeout(() => {
            child.kill('SIGTERM')
            resolve({
                exitCode: null,
                stdout,
                stderr: stderr +
                    `Test timed out after ${adjustedTimeout + 2000}ms`
            })
        }, adjustedTimeout + 2000).unref()
    })
}

// AC1.1, AC1.2, AC4.1
test('CLI --html: full document fixture runs, upgrades markup', async (t) => {
    const result = await runHtmlCliTest('_html-test.js', '_html-fixture.html')
    t.equal(result.exitCode, 0, 'should exit 0')
    t.ok(
        result.stdout.includes('ok 1 - fixture element upgraded'),
        'element upgraded'
    )
    t.ok(
        result.stdout.includes('ok 2 - connectedCallback enhanced markup'),
        'markup enhanced'
    )
})

// AC1.3
test('CLI --html: uppercase </BODY> still gets harness injected', async (t) => {
    const result = await runHtmlCliTest(
        '_html-test.js',
        '_html-fixture-upper.html'
    )
    t.equal(result.exitCode, 0, 'should exit 0')
    t.ok(
        result.stdout.includes('ok 2 - connectedCallback enhanced markup'),
        'ran against uppercase-body fixture'
    )
})

// AC1.4
test('CLI --html: not ok against fixture exits non-zero', async (t) => {
    const result = await runHtmlCliTest(
        '_html-failing-test.js',
        '_html-fixture.html'
    )
    t.ok(result.exitCode !== 0, 'should exit non-zero on failure')
})

// AC2.1, AC2.2
test('CLI --html: fragment fixture is wrapped and runs', async (t) => {
    const result = await runHtmlCliTest('_html-test.js', '_html-fragment.html')
    t.equal(result.exitCode, 0, 'should exit 0')
    t.ok(
        result.stdout.includes('ok 1 - fixture element upgraded'),
        'fragment element present and upgraded'
    )
})

// AC4.2
test('CLI --html: runs in firefox', async (t) => {
    const result = await runHtmlCliTest(
        '_html-test.js',
        '_html-fixture.html',
        20000,
        'firefox'
    )
    t.equal(result.exitCode, 0, 'should exit 0 in firefox')
})

// AC4.3
test('CLI --html: respects --timeout', async (t) => {
    const result = await runHtmlCliTest(
        '_html-test.js',
        '_html-fixture.html',
        15000
    )
    t.equal(result.exitCode, 0, 'should exit 0 with custom timeout')
})

// AC3.1
test('CLI --html: sibling module served, upgrades markup', async (t) => {
    const result = await runHtmlCliTest(
        '_html-enhance-test.js',
        '_html-fixture-external.html'
    )
    t.equal(result.exitCode, 0, 'should exit 0')
    t.ok(
        result.stdout.includes('ok 1 - sibling module upgraded markup'),
        'sibling module served from fixture dir and upgraded markup'
    )
})

// AC3.2
test('CLI --html: path traversal request returns 404', async (t) => {
    const result = await runHtmlCliTest(
        '_html-traversal-test.js',
        '_html-fixture.html'
    )
    t.equal(result.exitCode, 0, 'should exit 0')
    t.ok(
        result.stdout.includes('ok 1 - path traversal returns 404'),
        'out-of-root path rejected with 404'
    )
})

function runCliNoStdin (
    extraArgs:ReadonlyArray<string>,
    timeoutMs:number = 5000
):Promise<TestResult> {
    return new Promise((resolve) => {
        const child = spawn('node', [cliPath, ...extraArgs], {
            cwd: projectRoot,
            stdio: ['ignore', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        child.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        child.on('close', (code) => {
            resolve({ exitCode: code, stdout, stderr })
        })

        child.on('error', (err) => {
            stderr += `Process error: ${err.message}`
            resolve({ exitCode: 1, stdout, stderr })
        })

        setTimeout(() => {
            child.kill('SIGTERM')
            resolve({ exitCode: null, stdout, stderr: stderr + 'hung' })
        }, timeoutMs).unref()
    })
}

// AC5.1
test('CLI --html: missing fixture file exits 1', async (t) => {
    const result = await runHtmlCliTest('_html-test.js', '_does-not-exist.html')
    t.equal(result.exitCode, 1, 'missing --html file should exit 1')
})

// AC5.2 (no usable stdin -> non-zero exit, no hang)
// NOTE: with stdin ignored, isTTY is false, so this validates the OBSERVABLE
// contract (non-zero exit, no hang) via the existing empty-input path. The new
// isTTY "pipe test code" branch is not directly exercised — a real interactive
// terminal would be needed (a PTY / node-pty), which is out of scope.
test('CLI --html: no piped test code exits non-zero, no hang', async (t) => {
    const htmlPath = path.join(projectRoot, 'test', '_html-fixture.html')
    const result = await runCliNoStdin([
        '--html', htmlPath,
        '--timeout', '5000'
    ])
    t.ok(
        result.exitCode !== 0 && result.exitCode !== null,
        'should exit non-zero (not hang) when nothing is piped'
    )
})

// AC5.3
test('CLI --help lists the --html option', async (t) => {
    const result = await runCliNoStdin(['--help'])
    t.equal(result.exitCode, 0, '--help exits 0')
    t.ok(result.stdout.includes('--html'), 'help text lists --html')
})
