# DarkScan AI Browser Guard

This is a consent-based browser extension that scans visited URLs with your DarkScan AI backend.

## What it does

- lets the user connect the extension to a DarkScan AI server
- scans visited `http` and `https` tabs after the user turns monitoring on
- sends visited URLs to the backend for analysis
- can email suspicious visit reports using the saved alert email on the account
- can manually trigger a scan for the current tab

## How to load it in Chrome, Edge, or Opera

1. open the browser extensions page
2. enable `Developer mode`
3. choose `Load unpacked`
4. select this `browser-extension` folder

## How to use it locally

1. open the extension popup
2. set `Backend URL` to your app address such as `http://localhost:3000`
3. enter your DarkScan AI email/user ID and password
4. click `Connect`
5. leave `Scan visited tabs automatically` enabled
6. optionally enable `Email reports for suspicious visits`
7. choose the minimum severity and cooldown

## Prepare it for deployment

When your DarkScan AI app is deployed on Render or another domain, create a deployment-ready package with that backend URL prefilled:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-browser-extension.ps1 -BackendUrl https://your-service.onrender.com
```

This generates:

- `browser-extension/dist/darkscan-ai-browser-guard/`
- `browser-extension/dist/darkscan-ai-browser-guard-chromium.zip`
- `browser-extension/dist/darkscan-ai-browser-guard-firefox.xpi`

The packaged extension keeps the same behavior, but the popup defaults to your deployed app instead of `localhost`.

## Distribution options

- Manual install: users load the unpacked folder or unzip the Chromium package and use `Load unpacked`
- Browser store upload: upload the generated Chromium zip to Chrome Web Store or Edge Add-ons
- Managed enterprise install: IT can deploy the published extension through browser policies on company-owned devices

## Important note

This extension is designed as an explicit opt-in monitoring tool. It should only be used where users understand that browser visit scanning is enabled and have agreed to it.
