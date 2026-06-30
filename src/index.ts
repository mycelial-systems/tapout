import { chromium, firefox, webkit, type BrowserType } from 'playwright'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promises as fs } from 'node:fs'
import { generateHTMLContent } from './util.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type SupportedBrowser = 'chromium'|'firefox'|'webkit'|'edge'

const browsers:Record<SupportedBrowser, BrowserType> = {
    chromium,
    firefox,
    webkit,
    edge: chromium  // Edge uses Chromium engine
}

type ConsoleMethod = 'log'|'info'|'warn'|'error'|'debug'

// Playwright's console message `type()` is not always a Node `console`
// method name -- e.g. `console.warn` reports as "warning" and
// `console.group` as "startGroup". Map the known ones and fall back to
// `log` so forwarding a page-side message can never crash the run.
const CONSOLE_METHOD:Record<string, ConsoleMethod> = {
    log: 'log',
    info: 'info',
    debug: 'debug',
    error: 'error',
    warning: 'warn'
}

function consoleMethod (type:string):ConsoleMethod {
    return CONSOLE_METHOD[type] || 'log'
}

function parseTestLine (line: string) {
    const test = {
        name: '',
        status: 'passed' as 'passed'|'failed'|'skipped',
        duration: Math.floor(Math.random() * 100) + 10, // Mock duration
        error: undefined as string|undefined
    }

    // Determine if test passed or failed
    test.status = line.startsWith('ok ') ? 'passed' : 'failed'

    // Remove "ok " or "not ok " prefix and test number
    const remaining = line.replace(/^(not )?ok \d+\s*-?\s*/, '')

    // Extract description
    test.name = remaining.trim()

    return test
}

async function generateHTMLReport (
    testResults:Array<{
        name:string;
        status:'passed' | 'failed' | 'skipped';
        duration?:number;
        error?:string;
    }>,
    browserName:string,
    duration:number,
    outdir?:string,
    outfile?:string
):Promise<string|null> {
    const html = generateHTMLContent(testResults, browserName, duration)

    const filename = outfile || 'index.html'

    // If no outfile specified and no outdir specified, output to stdout
    if (!outfile && !outdir) {
        return null // Signal to output to stdout
    }

    const outputPath = outdir ? path.join(outdir, filename) : filename

    // Create output directory if it doesn't exist
    if (outdir) {
        await fs.mkdir(outdir, { recursive: true })
    }

    await fs.writeFile(outputPath, html, 'utf8')
    return outputPath
}

export async function readStdin ():Promise<string> {
    return new Promise((resolve, reject) => {
        let data = ''

        process.stdin.setEncoding('utf8')
        process.stdin.on('data', chunk => {
            data += chunk
        })

        process.stdin.on('end', () => {
            resolve(data)
        })

        process.stdin.on('error', reject)
    })
}

/**
 * Transform test code to support Vite environment variables.
 * Replaces import.meta.env references with appropriate values.
 */
function transformViteEnv (code:string):string {
    // Replace Vite environment variables with test-appropriate values
    let transformed = code

    // Replace import.meta.env.DEV with true (tests run in dev mode)
    transformed = transformed.replace(/import\.meta\.env\.DEV/g, 'true')

    // Replace import.meta.env.PROD with false
    transformed = transformed.replace(/import\.meta\.env\.PROD/g, 'false')

    // Replace import.meta.env.MODE with "test"
    transformed = transformed.replace(/import\.meta\.env\.MODE/g, '"test"')

    // Replace import.meta.env.BASE_URL with "/"
    transformed = transformed.replace(/import\.meta\.env\.BASE_URL/g, '"/"')

    // Replace import.meta.env.SSR with false
    transformed = transformed.replace(/import\.meta\.env\.SSR/g, 'false')

    return transformed
}

/**
 * Build the page served at GET / in --html mode: the user's fixture with the
 * harness script injected immediately before the last </body>. A bare fragment
 * (no <!doctype>/<html>) is wrapped in a minimal document first. Injection is
 * case-insensitive; if there is no </body>, the harness is appended.
 *
 * Note: injection is string-based. A literal "</body>" inside a comment or
 * string in the fixture could be matched (accepted dev-tooling trade-off).
 */
function buildInjectedPage (rawHtml:string):string {
    const harnessTag =
        '<script type="module" src="/__tapout/harness.js"></script>'

    // Detect full document vs fragment (case-insensitive).
    const lower = rawHtml.toLowerCase()
    const isDocument =
        lower.includes('<!doctype') || lower.includes('<html')

    const doc = isDocument ?
        rawHtml :
        '<!doctype html><html><head><meta charset="utf-8"></head>' +
            '<body>' + rawHtml + '</body></html>'

    // Inject before the last case-insensitive </body>; append if absent.
    const closeIndex = doc.toLowerCase().lastIndexOf('</body>')
    if (closeIndex === -1) {
        return doc + harnessTag
    }
    return doc.slice(0, closeIndex) + harnessTag + doc.slice(closeIndex)
}

const MIME_TYPES:Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
    '.wasm': 'application/wasm',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain'
}

type StaticResult =
    { status:200; body:Buffer; contentType:string } |
    { status:404 }

/**
 * Resolve urlPath under root and return the file, guarding against path
 * traversal. Returns 404 (not 403) for anything that escapes root or is
 * missing, so directory structure is not leaked.
 */
async function serveStaticFile (
    root:string,
    urlPath:string
):Promise<StaticResult> {
    let decoded:string
    try {
        // Strip any query string, then percent-decode.
        decoded = decodeURIComponent(urlPath.split('?')[0])
    } catch (_err) {
        return { status: 404 }
    }

    // Resolve under root, then verify the result stays inside root.
    const relative = decoded.replace(/^\/+/, '')
    const resolved = path.resolve(root, relative)
    const rel = path.relative(root, resolved)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return { status: 404 }
    }

    try {
        const body = await fs.readFile(resolved)
        const ext = path.extname(resolved).toLowerCase()
        const contentType = MIME_TYPES[ext] || 'application/octet-stream'
        return { status: 200, body, contentType }
    } catch (_err) {
        // Missing file, or path is a directory (EISDIR) -> 404.
        return { status: 404 }
    }
}

export async function runTestsInBrowser (
    testCode:string,
    options:{
        timeout?:number;
        customTimeout?:boolean;
        browser?:SupportedBrowser;
        reporter?: 'tap' | 'html';
        outdir?: string;
        outfile?: string;
        html?: string;
    } = {}
):Promise<void> {
    const PORT = 8123
    const timeout = options.timeout || 5000
    const customTimeout = options.customTimeout || false
    const browserType = options.browser || 'chromium'
    const reporter = options.reporter || 'tap'

    // In --html mode, read the fixture and build the injected page once.
    let injectedPage:string|null = null
    let staticRoot = ''
    if (options.html) {
        const htmlPath = path.resolve(options.html)
        let rawHtml:string
        try {
            rawHtml = await fs.readFile(htmlPath, 'utf8')
        } catch (_err) {
            throw new Error(`could not read --html file: ${options.html}`)
        }
        injectedPage = buildInjectedPage(rawHtml)
        staticRoot = path.dirname(htmlPath)
    }

    // Store test results for non-TAP reporters
    const testResults: Array<{
        name: string;
        status: 'passed' | 'failed' | 'skipped';
        duration?: number;
        error?: string;
    }> = []
    const testStartTime = Date.now()

    // Custom server to serve static files and dynamic test code
    const server = createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${PORT}`)
        const pathname = url.pathname

        try {
            if (pathname === '/__tapout/harness.js') {
                // Serve the in-page harness module
                const harnessPath = path.join(__dirname, 'test-harness.js')
                const harnessContent = await fs.readFile(harnessPath, 'utf8')
                res.writeHead(200, {
                    'Content-Type': 'application/javascript'
                })
                res.end(harnessContent)
            } else if (pathname === '/__tapout/test-bundle.js') {
                // Serve the test code with Vite env transformation
                const transformedCode = transformViteEnv(testCode)
                res.writeHead(200, {
                    'Content-Type': 'application/javascript'
                })
                res.end(transformedCode)
            } else if (injectedPage !== null) {
                // --html mode
                if (pathname === '/') {
                    res.writeHead(200, { 'Content-Type': 'text/html' })
                    res.end(injectedPage)
                } else {
                    // Serve a static file from the fixture's directory.
                    const result = await serveStaticFile(staticRoot, pathname)
                    if (result.status === 200) {
                        res.writeHead(200, {
                            'Content-Type': result.contentType
                        })
                        res.end(result.body)
                    } else {
                        res.writeHead(404)
                        res.end('Not Found')
                    }
                }
            } else if (
                pathname === '/' ||
                pathname === '/test-runner.html'
            ) {
                // Default mode: serve the static HTML runner page
                const htmlPath = path.join(__dirname, 'test-runner.html')
                const htmlContent = await fs.readFile(htmlPath, 'utf8')
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end(htmlContent)
            } else {
                res.writeHead(404)
                res.end('Not Found')
            }
        } catch (_error) {
            res.writeHead(500)
            res.end('Server Error')
        }
    })

    try {
        server.listen(PORT)

        const browserOptions = browserType === 'edge' ?
            { channel: 'msedge' as const } :
            (browserType === 'firefox' ?
                {
                    headless: true,
                    firefoxUserPrefs: {
                        'security.sandbox.content.level': 0,
                        'security.sandbox.plugin.level': 0,
                        'dom.webgpu.enabled': false
                    }
                } :
                {})

        const browser = await browsers[browserType === 'edge' ?
            'chromium' :
            browserType].launch(browserOptions)
        const page = await browser.newPage()
        const browserName = browserType === 'edge' ?
            'edge' :
            browser.browserType().name()

        // TAP comment -- which browser is being used
        if (reporter === 'tap') {
            console.log(`# Running tests in ${browserName}`)
        }

        let hasErrors = false

        page.on('console', msg => {
            const text = msg.text()

            // For TAP reporter, output directly to console
            if (reporter === 'tap') {
                console[consoleMethod(msg.type())](text)
            }

            // Parse and store test results for other reporters
            if (text.startsWith('ok ') || text.startsWith('not ok ')) {
                const testResult = parseTestLine(text)
                if (testResult) {
                    testResults.push(testResult)
                }
            }

            // TAP failures, errors, specific failure patterns
            // But ignore common browser resource loading messages
            if (
                text.startsWith('not ok') ||
                (
                    text.includes('Error:') &&
                    !text.includes('Failed to load resource')
                ) ||
                (
                    text.includes('Failed') &&
                    !text.includes('Failed to load resource')
                ) ||
                text.includes('FAIL') ||
                (
                    msg.type() === 'error' &&
                    !text.includes('Failed to load resource')
                )
            ) {
                hasErrors = true
            }
        })

        page.on('pageerror', error => {
            console.error(`Page error: ${error.message}`)
            hasErrors = true
        })

        try {
            const pagePath = injectedPage !== null ? '/' : '/test-runner.html'
            await page.goto(
                `http://localhost:${PORT}${pagePath}` +
                    `?timeout=${timeout}&custom=${customTimeout}`
            )

            try {
                await page.waitForFunction(
                    // @ts-expect-error this runs in a browser
                    () => window.testsFinished === true,
                    null,
                    {
                        timeout
                    }
                )

                // @ts-expect-error this runs in a browser
                const testsFailed = await page.evaluate(() => window.testsFailed)

                if (hasErrors || testsFailed) {
                    throw new Error('Tests failed')
                } else {
                    // Tests passed - no additional output needed for TAP
                }
            } catch (timeoutError:any) {
                if (
                    timeoutError.message &&
                    timeoutError.message.includes('Timeout')
                ) {
                    throw new Error('Tests timed out')
                } else {
                    throw timeoutError
                }
            }
        } finally {
            await browser.close()
            server.close()

            // Generate HTML report if requested
            if (reporter === 'html') {
                const duration = Date.now() - testStartTime
                const htmlPath = await generateHTMLReport(
                    testResults,
                    browserName,
                    duration,
                    options.outdir,
                    options.outfile
                )

                if (htmlPath === null) {
                    // Output HTML to stdout
                    const html = generateHTMLContent(
                        testResults,
                        browserName,
                        duration
                    )
                    console.log(html)
                } else {
                    console.log(`HTML report generated: ${htmlPath}`)
                }
            }
        }
    } catch (error) {
        server.close()
        throw error
    }
}
