# Jenkins Build Parameters Sidebar

A Tampermonkey userscript that displays the complete parameters of each Jenkins build directly in the **Builds** sidebar.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Features

- Displays parameter names and values in a readable two-column layout.
- Requests data through Jenkins' built-in build JSON API using your existing browser session.
- Renders every parameter value in full: long values wrap rather than being truncated.
- Displays comma-separated values one value per line—useful for deployment target lists such as `server=a,b,c`.
- Watches dynamically loaded build-history entries, including entries exposed through open Shadow DOM roots.
- Does not require a Jenkins API token or save credentials.

> **Security note:** The script intentionally displays all parameter values. Do not use it where sensitive parameters (passwords, tokens, secrets, etc.) could be visible to people who should not see them.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open [`jenkins-build-parameters-sidebar.user.js`](./jenkins-build-parameters-sidebar.user.js) in GitHub's raw view, then install it with Tampermonkey; or create a new userscript and paste in its contents.
3. Edit the script metadata and restrict `@match` to your Jenkins host before saving. For example:

   ```javascript
   // @match        https://jenkins.example.com/*
   ```

4. Refresh a Jenkins job page. Build parameters appear below their corresponding build entries in the **Builds** sidebar.

## How it works

For every build link ending in a build number (such as `/job/example/123/`), the script loads:

```text
/job/example/123/api/json?tree=actions[parameters[name,value]]
```

It extracts the `parameters` available in Jenkins' `ParametersAction` response and renders them beneath that build entry.

Your current Jenkins browser login is used automatically via same-origin `fetch` requests.

## Limitations

- Your Jenkins account needs permission to read the job and its builds.
- The script is designed for Jenkins' standard modern Builds sidebar. Jenkins themes and third-party plugins can alter DOM structures and may need selector/style adjustments.
- Only comma-delimited **string** values are split into separate lines. Other values are shown exactly as returned by Jenkins.

## Development

No build tooling or dependencies are required. Edit `jenkins-build-parameters-sidebar.user.js`, then use Tampermonkey's editor to test it.

Before publishing, replace these metadata placeholders in the script:

- `https://github.com/your-github-username/jenkins-build-parameters-sidebar`
- `Your Name`

## License

[MIT](./LICENSE)
