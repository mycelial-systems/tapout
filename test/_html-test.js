// Defines a custom element, then asserts the fixture markup was upgraded.
console.log('TAP version 13')
console.log('1..2')

class MyGreeting extends HTMLElement {
    connectedCallback () {
        const name = this.getAttribute('data-name') || 'nobody'
        this.textContent = 'Hello, ' + name
    }
}

customElements.define('my-greeting', MyGreeting)

const el = document.querySelector('my-greeting')

if (el instanceof MyGreeting) {
    console.log('ok 1 - fixture element upgraded')
} else {
    console.log('not ok 1 - fixture element not upgraded')
}

if (el && el.textContent === 'Hello, world') {
    console.log('ok 2 - connectedCallback enhanced markup')
} else {
    console.log('not ok 2 - markup not enhanced')
}

window.testsFinished = true
