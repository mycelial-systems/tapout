#!/usr/bin/env node

import { readStdin, runTestsInBrowser } from './index.js'

function showHelp () {
    console.log(`Usage: tapout [options]

Options:
  -t, --timeout <ms>    Timeout in milliseconds (default: 5000)
  -b, --browser <name>  Browser to use: chromium, firefox, webkit, edge (default: chromium)
  -r, --reporter <name> Output format: tap, html (default: tap)
  --outdir <path>       Output directory for HTML reports (default: current directory)
  --outfile <name>      Output filename for HTML reports (default: index.html)
  -h, --help           Show this help message

Examples:
  cat test.js | tapout --timeout 5000
  cat test.js | tapout --browser firefox
  cat test.js | tapout -b webkit -t 3000
  cat test.js | tapout --browser edge
  cat test.js | tapout --reporter html
  cat test.js | tapout --reporter html --outdir ./reports
  cat test.js | tapout --reporter html --outfile my-test-results.html`)
}

function parseArgs () {
    const args = process.argv.slice(2)
    let timeout = 5000  // default 5 seconds
    let browser:'chromium'|'firefox'|'webkit'|'edge' = 'chromium'  // default chrome
    let reporter: 'tap' | 'html' = 'tap'  // default TAP output
    let outdir: string | undefined
    let outfile: string | undefined
    let html: string | undefined
    let customTimeout = false  // track if timeout was explicitly set

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--timeout' || args[i] === '-t') {
            const timeoutValue = parseInt(args[i + 1], 10)
            if (isNaN(timeoutValue) || timeoutValue <= 0) {
                console.error('Error: timeout must be a positive ' +
                    'number in milliseconds')
                process.exit(1)
            }
            timeout = timeoutValue
            customTimeout = true
            i++  // skip the next argument since we consumed it
        } else if (args[i] === '--browser' || args[i] === '-b') {
            const browserValue = args[i + 1]
            if (
                !browserValue ||
                !['chromium', 'firefox', 'webkit', 'edge'].includes(browserValue)
            ) {
                console.error('Error: browser must be one of: ' +
                    'chromium, firefox, webkit, edge')
                process.exit(1)
            }
            browser = browserValue as 'chromium'|'firefox'|'webkit'|'edge'
            i++  // skip the next argument since we consumed it
        } else if (args[i] === '--reporter' || args[i] === '-r') {
            const reporterValue = args[i + 1]
            if (
                !reporterValue ||
                !['tap', 'html'].includes(reporterValue)
            ) {
                console.error('Error: reporter must be one of: ' +
                    'tap, html')
                process.exit(1)
            }
            reporter = reporterValue as 'tap' | 'html'
            i++  // skip the next argument since we consumed it
        } else if (args[i] === '--outdir') {
            const outdirValue = args[i + 1]
            if (!outdirValue) {
                console.error('Error: --outdir requires a directory path')
                process.exit(1)
            }
            outdir = outdirValue
            i++  // skip the next argument since we consumed it
        } else if (args[i] === '--outfile') {
            const outfileValue = args[i + 1]
            if (!outfileValue) {
                console.error('Error: --outfile requires a filename')
                process.exit(1)
            }
            outfile = outfileValue
            i++  // skip the next argument since we consumed it
        } else if (args[i] === '--html') {
            const htmlValue = args[i + 1]
            if (!htmlValue) {
                console.error('Error: --html requires a file path')
                process.exit(1)
            }
            html = htmlValue
            i++  // skip the next argument since we consumed it
        } else if (args[i] === '--help' || args[i] === '-h') {
            showHelp()
            process.exit(0)
        } else {
            console.error(`Unknown option: ${args[i]}`)
            console.error('Use --help for usage information')
            process.exit(1)
        }
    }

    return {
        customTimeout,
        timeout,
        browser,
        reporter,
        outdir,
        outfile,
        html,
        hasArgs: args.length > 0
    }
}

async function main () {
    try {
        const {
            customTimeout, timeout, browser, reporter, outdir, outfile,
            html, hasArgs
        } = parseArgs()

        // If no arguments and stdin is a TTY (interactive terminal), show help
        if (!hasArgs && process.stdin.isTTY) {
            showHelp()
            process.exit(0)
        }

        const testCode = await readStdin()

        if (!testCode.trim()) {
            console.error('No test code provided via stdin')
            process.exit(1)
        }

        await runTestsInBrowser(testCode, {
            timeout,
            customTimeout,
            browser,
            reporter,
            outdir,
            outfile,
            html
        })
    } catch (error) {
        console.error('Error running tests:', error)
        process.exit(1)
    }
}

main()
