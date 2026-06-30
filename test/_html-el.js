class MyGreeting extends HTMLElement {
    connectedCallback () {
        const name = this.getAttribute('data-name') || 'nobody'
        this.textContent = 'Hello, ' + name
    }
}

customElements.define('my-greeting', MyGreeting)
