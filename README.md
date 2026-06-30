# tapout
[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/tapout/nodejs.yml?style=flat-square)](https://github.com/substrate-system/tapout/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/tapout?style=flat-square)](README.md)
[![module](https://img.shields.io/badge/module-ESM%2FCJS-blue?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![Common Changelog](https://nichoth.github.io/badge/common-changelog.svg)](./CHANGELOG.md)
[![license](https://img.shields.io/badge/license-Big_Time-blue?style=flat-square)](LICENSE)


The easiest way to run tests in a browser from the command line.
Just pipe some JS into this command. A spiritual successor
to [tape-run](https://github.com/tape-testing/tape-run).

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [*Featuring*](#featuring)
- [Install](#install)
  * [Install Playwright Dependencies](#install-playwright-dependencies)
- [Use](#use)
  * [`window.testsFinished`](#windowtestsfinished)
  * [Vite environment variables](#vite-environment-variables)
  * [CI](#ci)
  * [Generate HTML reports](#generate-html-reports)
  * [`-b`, `--browser`](#-b---browser)
  * [`-t`, `--timeout`](#-t---timeout)
  * [`-r`, `--reporter`](#-r---reporter)
  * [`--html`](#--html)
  * [GitHub Pages Integration](#github-pages-integration)
- [Accessibility Testing with Axe](#accessibility-testing-with-axe)
  * [Test specific WCAG rules](#test-specific-wcag-rules)
- [Example Tests](#example-tests)
- [HTML report](#html-report)
  * [Test](#test)

<!-- tocstop -->

</details>

This uses [playwright](https://playwright.dev/) under the hood.

```
Usage: tapout [options]
            
Options:
  -t, --timeout <ms>    Timeout in milliseconds (default: 5000)
  -b, --browser <name>  Browser to use: chromium, firefox, webkit, edge (default: chromium)
  -r, --reporter <name> Output format: tap, html (default: tap)
  --outdir <path>       Output directory for HTML reports (default: current directory)
  --outfile <name>      Output filename for HTML reports (default: index.html)
  --html <path>         Serve a custom HTML fixture as the test page (for web components)
  -h, --help           Show this help message

Examples:
  cat test.js | tapout --timeout 5000
  cat test.js | tapout --browser firefox
  cat test.js | tapout -b webkit -t 3000
  cat test.js | tapout --browser edge
  cat test.js | tapout --reporter html
  cat test.js | tapout --reporter html --outdir ./reports
  cat test.js | tapout --reporter html --outfile my-test-results.html
  cat test.js | tapout --html ./fixture.html
```

## *Featuring*

- **Cross-browser testing**: Run tests in Chrome, Firefox, Safari (WebKit),
  or Edge
- **Vite compatible**: Support for `import.meta.env` variables
- **Smart timeout handling**: Use custom timeouts or auto-timeout
- **Beautiful HTML reports**: Generate HTML reports
- **TAP compatible**: Standard TAP output works with any TAP formatter
- **Zero configuration**: Just pipe JavaScript into this command
- **CI/CD friendly**: Proper exit codes

## Install

```sh
npm i -D @substrate-system/tapout
```

### Install Playwright Dependencies

After installing this, you will need to install dependencies for Playwright
also.

```sh
npx playwright install --with-deps
```


## Use

Pipe some Javascript to this command.

```sh
cat ./test/index.js | npx tapout
```

Use shell redirection

```sh
npx esbuild --bundle ./test/index.ts | npx tapout | npx tap-spec
```

### `window.testsFinished`

The test browser will automatically close within few seconds of no activity.

To explicitly end the tests, set a property on `window`.

```js
import { test } from '@substrate-system/tapzero'

test('example test', (t) => {
  t.ok(true)
})

test('all done', () => {
  // This will cause the tests to exit immediately.
  // @ts-expect-error tests
  window.testsFinished = true
})
```

### Vite environment variables

Vite environment variables, like `import.meta.env.DEV` are defined, so your
tests wont break if you use them in your application code.

* `import.meta.env.DEV` - `true` (tests run in development mode)
* `import.meta.env.PROD` - `false`
* `import.meta.env.MODE` - `"test"`
* `import.meta.env.BASE_URL` - `"/"`
* `import.meta.env.SSR` - `false`


#### Example

```js
// Your Vite app code can use these environment variables
if (import.meta.env.DEV) {
  console.log('Running in development mode')
}

const apiUrl = import.meta.env.DEV ?
  'http://localhost:3000/api' :
  'https://production.api.com'
```


### CI

After `npm install`, you will need to do an `npx playwright install`.

For example, in Github CI,

```yml
# ...

    - name: npm install, build
      run: |
        npm install
        npm run build --if-present
        npm run lint
        npx playwright install --with-deps
      env:
        CI: true

# ...
```

### Generate HTML reports

By default writes to `stdout`.

```sh
cat ./test/index.js | npx tapout --reporter html > index.html
open index.html  # View the generated report
```

#### HTML Summary

* `--reporter html` with no other options -> output HTML to stdout
* `--reporter html --outfile filename.html` -> save to `filename.html` in
  current directory
* `--reporter html --outdir ./reports` -> save to `./reports/index.html`
* `--reporter html --outdir ./reports --outfile custom.html` -> save to
  `./reports/custom.html`


### `-b`, `--browser`

Pass in the name of a browser to use. Default is Chrome.

Possibilities are `chromium`, `firefox`, `webkit`, or `edge`.

### `-t`, `--timeout`

Pass in a different timeout value. The default is 5 seconds.

The timeout respects the auto-finish behavior:

- With **default timeout** (no `-t` flag): Auto-finish triggers after a short
  delay (1-2 seconds) when no test activity is detected
- With **custom timeout** (using `-t`): Auto-finish uses 80% of the specified
  timeout, giving tests more time to complete naturally

```sh
cat test.js | npx tapout --timeout 5000
```

**Errors**: tapout automatically detects test failures from:

- Unhandled promise rejections
- Uncaught exceptions  
- Console error messages with common error patterns
- TAP "not ok" results

Tests will exit with code 1 if any errors are detected, which is good for
CI/CD pipelines.

### `-r`, `--reporter`

Choose the output format. Default is TAP.

>
> [!NOTE]  
> For HTML output, you will want to redirect stdout to a file.
> `cat test.js | npx tapout --reporter html > test-output.html`
>

**Available reporters:**
- `tap` - TAP output (default) - Standard Test Anything Protocol format
- `html` - Generate an HTML report file with beautiful, responsive design

```sh
# Generate HTML and output to stdout
cat test.js | npx tapout --reporter html > my-report.html

# Use TAP output (default)
cat test.js | npx tapout

# Customize output location
cat test.js | npx tapout --reporter html --outdir ./reports
cat test.js | npx tapout --reporter html --outfile my-test-results.html
cat test.js | npx tapout --reporter html --outdir ./reports --outfile custom-report.html
```

The HTML reporter generates an `index.html` file by default with:

- Test summary with pass/fail counts and percentages
- Individual test results with status indicators
- Browser and timing information

**Output Control:**
- `--outdir <path>` - Specify where to save the HTML report
  (default: current directory)
- `--outfile <name>` - Specify the filename for the HTML report
  (default: index.html)
- If neither `--outdir` nor `--outfile` is specified, HTML output is sent
  to stdout

### `--html`

By default tapout serves a minimal empty page. Web components need real
markup to upgrade, so pass `--html <path>` to serve your own HTML fixture as
the page the browser visits. The completion harness and your piped test are
injected automatically (just before `</body>`), and the fixture's directory
is served as a static root so relative assets — CSS, sibling modules, images
— resolve.

A bare fragment (no `<!doctype>`/`<html>`) is wrapped in a minimal document
for you.

`fixture.html`:

```html
<!doctype html>
<html>
  <body>
    <my-greeting data-name="world"></my-greeting>
    <script type="module" src="./my-greeting.js"></script>
  </body>
</html>
```

Run it (assertions still come from stdin):

```bash
cat test.js | tapout --html ./fixture.html
```

The markup is parsed first, then `my-greeting.js` registers the component and
the browser upgrades the existing element before your assertions run.

Two caveats: tapout reserves the `/__tapout/` URL prefix for its harness and
test bundle, so a fixture asset under that path would be shadowed; and harness
injection finds the last `</body>` by string match, so a literal `</body>`
inside a comment or string in the fixture could be matched.

### GitHub Pages Integration

The generated HTML file is self-contained and can be easily hosted on GitHub
Pages or any static hosting service. Simply commit the HTML file to
your repository.

```sh
# Example CI workflow
npm test 2>&1 | npx tapout --reporter html --outfile test-results.html
git add test-results.html
git commit -m "Update test results"
git push
```

---

## Accessibility Testing with Axe

See [Axe](https://github.com/dequelabs/axe-core-npm).

You can import some utilities from tapout:

```js
import { test } from '@substrate-system/tapzero'
import {
  assertNoViolations,
  assertWCAGCompliance
} from '@substrate-system/tapout/axe'

test('page has no accessibility violations', async (t) => {
  document.body.innerHTML = `
    <main>
      <h1>Welcome</h1>
      <button>Click me</button>
      <img src="test.jpg" alt="Test image" />
    </main>
  `

  await assertNoViolations(t)
})

test('form meets WCAG AA compliance', async (t) => {
  document.body.innerHTML = `
    <form>
      <label for="username">Username</label>
      <input id="username" type="text" />

      <label for="password">Password</label>
      <input id="password" type="password" />

      <button type="submit">Submit</button>
    </form>
  `

  await assertWCAGCompliance(t, 'AA')
})

test('can test specific elements', async (t) => {
  document.body.innerHTML = `
    <nav aria-label="Main navigation">
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/about">About</a></li>
      </ul>
    </nav>
  `

  const nav = document.querySelector('nav')
  await assertNoViolations(t, {
    context: nav
  }, 'navigation should be accessible')
})

test('flexible WCAG level testing', async (t) => {
  document.body.innerHTML = `<div>Content</div>`

  // Letter levels
  await assertWCAGCompliance(t, 'AA')

  // Direct tag names
  await assertWCAGCompliance(t, 'wcag2a')

  // Multiple tags (useful for testing specific WCAG versions)
  await assertWCAGCompliance(t, ['wcag2a', 'wcag21a'])
})

test('cleanup', () => {
  // @ts-expect-error browser global
  window.testsFinished = true
})
```

### Test specific WCAG rules

```js
test('check color contrast only', async (t) => {
  document.body.innerHTML = `<div style="color: #333; background: #fff;">
    Content
  </div>`

  await assertNoViolations(t, {
    runOnly: { type: 'rule', values: ['color-contrast'] }
  }, 'should pass color contrast')
})
```

#### Disable specific rules

```js
await assertNoViolations(t, {
  rules: {
    'color-contrast': { enabled: false }  // Skip incomplete styles
  }
})
```

#### Component testing

```js
import { MyComponent } from '../src/components/MyComponent.js'

test('MyComponent is accessible', async (t) => {
  const container = document.createElement('div')
  document.body.appendChild(container)

  // Render your component
  const component = new MyComponent()
  component.mount(container)

  // Test accessibility
  await assertNoViolations(t, { context: container })

  container.remove()
})
```

## Example Tests

Write tests for the browser environment.

> [!TIP]
> End the tests explicity with `window.testsFinished = true`.
> Else they time out naturally, which is ok too.

```js
// test/index.ts
import { test } from '@substrate-system/tapzero'

test('example', t => {
    t.ok(document.body, 'should find a body tag')
})

test('all done', t => {
  // @ts-expect-error explicitly end
  window.testsFinished = true
})
```

Run the tests on the command line.

```sh
npx esbuild ./test/index.ts | npx tapout
```

## HTML report
```sh
# HTML reporter examples  
npm run test:simple -- --reporter html     # Generate HTML report
```

### Test

Run the tests for this module. See the [`test/` directory](./test/).

```bash
npm test
```



---



```
/ed3d-plan-and-execute:execute-implementation-plan /Users/nick/code/tapout/docs/implementation-plans/2026-06-29-html-option/ /Users/nick/code/tapout/
```
