// ==UserScript==
// @name         Jenkins Build Parameters Sidebar
// @namespace    https://github.com/your-github-username/jenkins-build-parameters-sidebar
// @version      1.2.0
// @description  Show complete Jenkins build parameters in the Builds sidebar. Comma-separated values are rendered one per line.
// @author       Your Name
// @match        *://*/job/*
// @run-at       document-idle
// @grant        none
// @license       MIT
// ==/UserScript==

(() => {
  'use strict';

  const PARAM_CLASS = 'tm-jenkins-build-parameters';
  const loadedBuilds = new Map();
  const observedRoots = new WeakSet();

  addStyle();

  function extractParameters(build) {
    return (build.actions || [])
      .flatMap(action =>
        Array.isArray(action.parameters) ? action.parameters : []
      )
      .filter(parameter => parameter && parameter.name);
  }

  function formatValue(value) {
    if (value === null || value === undefined) {
      return '(empty)';
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  function getBuildApiUrl(buildUrl) {
    const apiUrl = new URL(buildUrl.href, location.href);
    apiUrl.pathname = `${apiUrl.pathname.replace(/\/?$/, '/')}api/json`;
    apiUrl.searchParams.set('tree', 'actions[parameters[name,value]]');
    return apiUrl;
  }

  function isBuildLink(link) {
    let url;

    try {
      url = new URL(link.href, location.href);
    } catch {
      return false;
    }

    return (
      url.origin === location.origin &&
      /\/\d+\/?$/.test(url.pathname) &&
      !url.pathname.includes('/api/')
    );
  }

  async function fetchBuildParameters(buildLink) {
    const cacheKey = buildLink.href;

    if (!loadedBuilds.has(cacheKey)) {
      loadedBuilds.set(cacheKey, (async () => {
        const response = await fetch(getBuildApiUrl(buildLink), {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Jenkins API request failed: HTTP ${response.status}`);
        }

        return extractParameters(await response.json());
      })());
    }

    return loadedBuilds.get(cacheKey);
  }

  function getBuildRow(link) {
    return (
      link.closest(
        'li, [role="listitem"], .build-history__entry, .build-entry'
      ) || link.parentElement
    );
  }

  function renderValue(valueElement, rawValue) {
    const text = formatValue(rawValue);

    if (typeof rawValue !== 'string' || !rawValue.includes(',')) {
      valueElement.textContent = text;
      return;
    }

    valueElement.classList.add(`${PARAM_CLASS}__value--list`);

    // Preserve every item, including empty items between consecutive commas.
    for (const rawItem of rawValue.split(',')) {
      const item = document.createElement('div');
      item.className = `${PARAM_CLASS}__value-item`;
      item.textContent = rawItem.trim() || '(empty)';
      valueElement.append(item);
    }
  }

  function renderParameters(link, parameters) {
    const row = getBuildRow(link);

    if (!row || row.querySelector(`.${PARAM_CLASS}`)) {
      return;
    }

    const container = document.createElement('div');
    container.className = PARAM_CLASS;

    if (parameters.length === 0) {
      const empty = document.createElement('div');
      empty.className = `${PARAM_CLASS}__empty`;
      empty.textContent = 'No build parameters';
      container.append(empty);
    } else {
      for (const parameter of parameters) {
        const item = document.createElement('div');
        item.className = `${PARAM_CLASS}__item`;

        const name = document.createElement('div');
        name.className = `${PARAM_CLASS}__name`;
        name.textContent = parameter.name;

        const value = document.createElement('div');
        value.className = `${PARAM_CLASS}__value`;
        renderValue(value, parameter.value);

        item.append(name, value);
        container.append(item);
      }
    }

    row.append(container);
  }

  async function processBuildLink(link) {
    if (
      !isBuildLink(link) ||
      link.dataset.tmJenkinsParametersLoading === 'true'
    ) {
      return;
    }

    link.dataset.tmJenkinsParametersLoading = 'true';

    try {
      renderParameters(link, await fetchBuildParameters(link));
    } catch (error) {
      // Do not alter Jenkins' normal UI when a build cannot be queried.
      console.debug('[Jenkins Build Parameters Sidebar]', error);
    }
  }

  function scan(root = document) {
    if (root instanceof Element && root.matches('a[href]')) {
      processBuildLink(root);
    }

    root.querySelectorAll?.('a[href]').forEach(processBuildLink);

    root.querySelectorAll?.('*').forEach(element => {
      if (element.shadowRoot) {
        observe(element.shadowRoot);
      }
    });
  }

  function observe(root) {
    if (observedRoots.has(root)) {
      return;
    }

    observedRoots.add(root);
    scan(root);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            continue;
          }

          scan(node);

          if (node.shadowRoot) {
            observe(node.shadowRoot);
          }
        }
      }
    });

    observer.observe(root, { childList: true, subtree: true });
  }

  function addStyle() {
    const style = document.createElement('style');

    style.textContent = `
      .${PARAM_CLASS} {
        box-sizing: border-box;
        display: grid;
        gap: 0;
        width: min(500px, calc(100% + 74px));
        max-width: calc(100vw - 90px);
        margin: 7px 0 15px;
        overflow: hidden;
        border: 1px solid #cbd9ed;
        border-radius: 8px;
        background: #fbfcff;
        color: #334d72;
        font-size: 13px;
        line-height: 1.5;
      }

      .${PARAM_CLASS}__item {
        display: grid !important;
        grid-template-columns: 120px minmax(0, 1fr) !important;
        min-width: 0;
        border-bottom: 1px solid #dce6f3;
      }

      .${PARAM_CLASS}__item:last-child {
        border-bottom: 0;
      }

      .${PARAM_CLASS}__name {
        box-sizing: border-box;
        min-width: 0;
        padding: 7px 10px;
        border-right: 1px solid #dce6f3;
        background: #f0f5fd;
        color: #496b9c;
        font-weight: 700;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .${PARAM_CLASS}__value {
        box-sizing: border-box;
        min-width: 0;
        padding: 7px 10px;
        color: #1f2937;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .${PARAM_CLASS}__value--list {
        display: grid;
        gap: 4px;
      }

      .${PARAM_CLASS}__value-item {
        padding: 3px 7px;
        border-left: 3px solid #79a6df;
        border-radius: 3px;
        background: #f2f6fc;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .${PARAM_CLASS}__empty {
        padding: 7px 10px;
        color: #6b7d96;
      }
    `;

    document.head.append(style);
  }

  observe(document);
})();
