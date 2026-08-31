// ==UserScript==
// @name         Jenkins 构建历史显示全部参数
// @namespace    local.jenkins.build-parameters
// @version      1.3.2
// @description  在 Jenkins 左侧 Builds 构建记录中显示完整构建参数；逗号分隔值以紧凑标签展示，超长列表可折叠
// @match        https://jenkins.*.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

   (() => {
     'use strict';

     // 将 @match 里的 jenkins.example.com 改成实际 Jenkins 域名。
     const PARAM_CLASS = 'tm-jenkins-build-parameters';
     const LOG_PREFIX = '[Jenkins Build Parameters]';
     const loadedBuilds = new Map();
     // 同一构建可能有多个链接（状态图标、编号、时间戳），按构建维度去重。
     // 记录的是面板元素本身：Jenkins 重绘构建行时面板会被移除，
     // 此时必须允许重新渲染，否则最新一条构建会永久丢失参数面板。
     const renderedBuilds = new Map();
     const observedRoots = new WeakSet();

     console.info(`${LOG_PREFIX} script started`, {
       href: location.href,
       readyState: document.readyState,
     });
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
         return '(空)';
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
       const pathParts = apiUrl.pathname.split('/');
       const buildIndex = pathParts.findLastIndex(part => /^\d+$/.test(part));

       if (buildIndex >= 0) {
         apiUrl.pathname = `${pathParts.slice(0, buildIndex + 1).join('/')}/api/json`;
       } else {
         apiUrl.pathname = `${apiUrl.pathname.replace(/\/?$/, '/')}api/json`;
       }
       apiUrl.searchParams.set(
         'tree',
         'actions[parameters[name,value]]'
       );

       console.debug(`${LOG_PREFIX} API URL`, apiUrl.href);
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
         /\/\d+(?:\/|$)/.test(url.pathname) &&
         !/\/api\/(?:json|xml)(?:\/|$)/.test(url.pathname)
       );
     }

     async function fetchBuildParameters(buildLink) {
       const apiUrl = getBuildApiUrl(buildLink);
       const cacheKey = apiUrl.href;

       if (!loadedBuilds.has(cacheKey)) {
         console.info(`${LOG_PREFIX} fetching build`, buildLink.href);
         loadedBuilds.set(cacheKey, (async () => {
           const response = await fetch(apiUrl, {
             credentials: 'same-origin',
             headers: {
               Accept: 'application/json',
             },
           });

           console.info(`${LOG_PREFIX} API response`, {
             url: cacheKey,
             status: response.status,
             ok: response.ok,
           });
           if (!response.ok) {
             throw new Error(`Jenkins API 请求失败：HTTP ${response.status}`);
           }

           const parameters = extractParameters(await response.json());
           console.info(`${LOG_PREFIX} parameters extracted`, {
             url: cacheKey,
             count: parameters.length,
             names: parameters.map(parameter => parameter.name),
           });
           return parameters;
         })());
       } else {
         console.debug(`${LOG_PREFIX} using cached build`, cacheKey);
       }

       return loadedBuilds.get(cacheKey);
     }

     function getBuildRow(link) {
       return (
         link.closest(
           'li, [role="listitem"], .build-history__entry, .build-entry'
         ) ||
         link.parentElement
       );
     }

     /**
      * 渲染完整参数值。
      * 若字符串有逗号，则每个值渲染成一个独立标签，横向排布自动换行。
      */
     const LIST_COLLAPSE_THRESHOLD = 12;

     function renderValue(valueElement, rawValue) {
       const text = formatValue(rawValue);

       if (typeof rawValue !== 'string' || !rawValue.includes(',')) {
         valueElement.textContent = text;
         return false;
       }

       valueElement.classList.add(`${PARAM_CLASS}__value--list`);

       // 不过滤空项，确保参数内容不被静默丢弃。
       const values = rawValue.split(',');
       const collapsible = values.length > LIST_COLLAPSE_THRESHOLD;

       values.forEach((rawItem, index) => {
         const item = document.createElement('span');
         item.className = `${PARAM_CLASS}__value-item`;
         item.textContent = rawItem.trim() || '(空)';

         if (collapsible && index >= LIST_COLLAPSE_THRESHOLD) {
           item.classList.add(`${PARAM_CLASS}__value-item--extra`);
         }

         valueElement.append(item);
       });

       if (collapsible) {
         const rest = values.length - LIST_COLLAPSE_THRESHOLD;
         const toggle = document.createElement('button');
         toggle.type = 'button';
         toggle.className = `${PARAM_CLASS}__toggle`;
         toggle.textContent = `+${rest}`;
         toggle.title = '展开剩余参数值';
         toggle.addEventListener('click', event => {
           event.preventDefault();
           event.stopPropagation();
           const expanded = valueElement.classList.toggle(
             `${PARAM_CLASS}__value--expanded`
           );
           toggle.textContent = expanded ? '收起' : `+${rest}`;
           toggle.title = expanded ? '收起参数值' : '展开剩余参数值';
         });
         valueElement.append(toggle);
       }

       return values.length > 1;
     }

     function renderParameters(link, parameters, buildKey) {
       const row = getBuildRow(link);

       if (!row) {
         console.debug(`${LOG_PREFIX} render skipped`, {
           url: link.href,
           rowFound: false,
         });
         return;
       }

       const existing = renderedBuilds.get(buildKey);

       // 面板仍在文档中才算已渲染；被 Jenkins 重绘移除后要重新补上。
       if (existing?.isConnected) {
         const owner = existing.parentElement;

         if (owner !== row && owner?.contains(row)) {
           // 新容器更靠内层，把面板移过去，宽度更合适。
           row.append(existing);
           console.debug(`${LOG_PREFIX} panel moved to inner row`, link.href);
         } else {
           console.debug(`${LOG_PREFIX} render skipped (duplicate build)`, {
             url: link.href,
             buildKey,
           });
         }
         return;
       }

       const inRow = row.querySelector(`.${PARAM_CLASS}`);

       if (inRow) {
         renderedBuilds.set(buildKey, inRow);
         console.debug(`${LOG_PREFIX} render skipped (row已有面板)`, link.href);
         return;
       }

       const container = document.createElement('div');
       container.className = PARAM_CLASS;

       if (parameters.length === 0) {
         const empty = document.createElement('div');
         empty.className = `${PARAM_CLASS}__empty`;
         empty.textContent = '无构建参数';
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

           // 显示完整值；逗号分隔内容以标签形式展示。
           const isList = renderValue(value, parameter.value);

           if (isList) {
             // 多值参数让值区域独占整行，避免被名称列挤成窄条。
             item.classList.add(`${PARAM_CLASS}__item--list`);

             const count = document.createElement('span');
             count.className = `${PARAM_CLASS}__count`;
             count.textContent = String(
               value.querySelectorAll(`.${PARAM_CLASS}__value-item`).length
             );
             name.append(count);
           }

           item.append(name, value);
           container.append(item);
         }
       }

       row.append(container);
       renderedBuilds.set(buildKey, container);
       console.info(`${LOG_PREFIX} rendered`, {
         url: link.href,
         parameterCount: parameters.length,
       });
     }

     async function processBuildLink(link) {
       if (!isBuildLink(link)) {
         return;
       }

       const buildKey = getBuildApiUrl(link).href;

       // 面板还在文档中才跳过；被重绘移除后即使链接元素被复用也要重试。
       if (
         link.dataset.tmJenkinsParametersLoading === 'true' &&
         renderedBuilds.get(buildKey)?.isConnected !== false
       ) {
         console.debug(`${LOG_PREFIX} link already loading`, link.href);
         return;
       }

       console.info(`${LOG_PREFIX} build link found`, link.href);
       link.dataset.tmJenkinsParametersLoading = 'true';

       try {
         const parameters = await fetchBuildParameters(link);
         renderParameters(link, parameters, buildKey);
       } catch (error) {
         console.error(`${LOG_PREFIX} failed`, {
           url: link.href,
           error,
         });
       }
     }

     function scan(root = document) {
       const links = root.querySelectorAll?.('a[href]') || [];
       const buildLinks = [...links].filter(isBuildLink);
       console.debug(`${LOG_PREFIX} scanning`, {
         root: root === document ? 'document' : root,
         links: links.length,
         buildLinks: buildLinks.length,
       });
       if (root === document && buildLinks.length === 0) {
         [...links].forEach((link, index) => {
           console.warn(`${LOG_PREFIX} initial anchor ${index + 1}: ${link.href}`);
         });
         console.warn(`${LOG_PREFIX} no build links found on initial scan`, {
           href: location.href,
           anchorCount: links.length,
         });
       }

       if (root instanceof Element && root.matches('a[href]')) {
         processBuildLink(root);
       }

       links.forEach(processBuildLink);

       root.querySelectorAll?.('*').forEach(element => {
         if (element.shadowRoot) {
           observe(element.shadowRoot);
         }
       });
     }

     function observe(root) {
       if (observedRoots.has(root)) {
         console.debug(`${LOG_PREFIX} root already observed`, root);
         return;
       }

       observedRoots.add(root);
       console.info(`${LOG_PREFIX} observing root`, root === document ? 'document' : root);
       scan(root);

       const observer = new MutationObserver(mutations => {
         for (const mutation of mutations) {
           for (const node of mutation.addedNodes) {
             if (node.nodeType !== Node.ELEMENT_NODE) {
               continue;
             }

             console.debug(`${LOG_PREFIX} DOM node added`, node);
             scan(node);

             if (node.shadowRoot) {
               observe(node.shadowRoot);
             }
           }
         }
       });

       observer.observe(root, {
         childList: true,
         subtree: true,
       });
     }

     function addStyle() {
       const style = document.createElement('style');

       style.textContent = `
         /*
          * 原位置会从构建链接右侧开始，空间非常小。
          * 这里将参数表左移并增宽，充分使用 Builds 面板的可用空间。
          */
         .${PARAM_CLASS} {
           box-sizing: border-box;
           display: flex;
           flex-direction: column;
           width: min(500px, calc(100% + 74px));
           max-width: calc(100vw - 90px);
           margin: 6px 0 14px 0;
           overflow: hidden;
           border: 1px solid #d5e0f0;
           border-radius: 8px;
           background: #fff;
           color: #334d72;
           font-size: 12px;
           line-height: 1.45;
         }

         /*
          * 名称与值默认同行；值区域最小 200px，放不下时自动换行到下一行，
          * 避免出现只有几十像素宽、把每个值折成三行的窄列。
          */
         .${PARAM_CLASS}__item {
           display: flex !important;
           flex-wrap: wrap;
           align-items: baseline;
           min-width: 0;
           padding: 5px 9px;
           border-top: 1px solid #edf2f9;
           column-gap: 8px;
           row-gap: 3px;
         }

         .${PARAM_CLASS}__item:first-child {
           border-top: 0;
         }

         .${PARAM_CLASS}__name {
           box-sizing: border-box;
           display: flex;
           flex: 0 0 auto;
           align-items: center;
           gap: 4px;
           min-width: 0;
           max-width: 100%;
           color: #7086a5;
           font-weight: 600;
           font-size: 11px;
           letter-spacing: .02em;
           text-transform: uppercase;
           overflow-wrap: anywhere;
         }

         /* 多值参数：名称单独占一行，值区域拿到整行宽度。 */
         .${PARAM_CLASS}__item--list .${PARAM_CLASS}__name {
           flex-basis: 100%;
         }

         .${PARAM_CLASS}__count {
           padding: 0 5px;
           border-radius: 8px;
           background: #e8effa;
           color: #4b6d9e;
           font-size: 10px;
           font-weight: 700;
           line-height: 15px;
         }

         .${PARAM_CLASS}__value {
           box-sizing: border-box;
           flex: 1 1 200px;
           min-width: 0;
           color: #1f2937;
           white-space: pre-wrap;
           overflow-wrap: anywhere;
         }

         /*
          * 对 server=a,b,c 这样的参数：
          * 每个值是一个紧凑标签，横向排布、自动换行。
          */
         .${PARAM_CLASS}__value--list {
           display: flex;
           flex-wrap: wrap;
           flex-basis: 100%;
           gap: 4px;
           white-space: normal;
         }

         .${PARAM_CLASS}__value-item {
           padding: 1px 7px;
           border: 1px solid #dbe6f5;
           border-radius: 10px;
           background: #f4f8fd;
           color: #35507a;
           font-size: 11px;
           line-height: 17px;
           white-space: nowrap;
           /* 单个值过长时才截断，正常长度保持一行完整显示。 */
           max-width: 100%;
           overflow: hidden;
           text-overflow: ellipsis;
         }

         .${PARAM_CLASS}__value--list:not(.${PARAM_CLASS}__value--expanded)
           .${PARAM_CLASS}__value-item--extra {
           display: none;
         }

         .${PARAM_CLASS}__toggle {
           padding: 1px 8px;
           border: 1px dashed #b9cbe6;
           border-radius: 10px;
           background: transparent;
           color: #4b6d9e;
           font: inherit;
           font-size: 11px;
           line-height: 17px;
           cursor: pointer;
         }

         .${PARAM_CLASS}__toggle:hover {
           background: #eef4fc;
         }

         .${PARAM_CLASS}__empty {
           padding: 6px 9px;
           color: #8496ab;
         }
       `;

       document.head.append(style);
       console.debug(`${LOG_PREFIX} style added`);
     }

     observe(document);

     // 兜底：Jenkins 会定时刷新最新构建行，重绘后面板可能丢失。
     // 这里定期重扫，命中缓存不会产生额外网络请求。
     setInterval(() => scan(document), 5000);
   })();
