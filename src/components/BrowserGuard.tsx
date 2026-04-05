import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Puzzle,
  ShieldCheck,
  Mail,
  MonitorSmartphone,
  Globe,
  CheckCircle2,
  FolderOpen,
  Copy,
  Package,
  Building2,
  X
} from 'lucide-react';
import { toast } from 'sonner';

const chromiumSteps = [
  'Open the browser extensions page in Chrome, Microsoft Edge, or Opera.',
  'Enable Developer mode.',
  'Choose Load unpacked.',
  'Select the browser-extension folder from this project.'
];

const connectSteps = [
  'Open the Browser Guard popup from the browser toolbar.',
  'Set Backend URL to your DarkScan AI app address.',
  'Sign in with your DarkScan AI email/user ID and password.',
  'Enable Scan visited tabs automatically.',
  'Choose the Browser Guard badge threshold and save your preferences.'
];

const behaviors = [
  'Visited http and https tabs can be scanned only after the user explicitly enables the extension.',
  'Scan results are sent to the DarkScan AI backend and stored as threat records.',
  'Browser Guard keeps visited-site scans inside DarkScan AI instead of directly emailing every browser visit.',
  'The extension includes a Scan Current Tab action for manual checks on demand.'
];

const deploymentSteps = [
  'Deploy DarkScan AI to Render or your chosen hosted domain first.',
  'Run the Browser Guard packaging script with your deployed app URL.',
  'Install the generated unpacked folder manually, or upload the generated package to a browser store.',
  'Ask users to connect the extension and enable Browser Guard from the popup.'
];

const distributionOptions = [
  'Manual install from the generated unpacked folder for internal testing or small teams.',
  'Chrome Web Store / Edge Add-ons upload using the generated Chromium zip package.',
  'Managed enterprise deployment through browser policies after your organization publishes or approves the extension.'
];

export default function BrowserGuard() {
  const [showSetupModal, setShowSetupModal] = useState(false);
  const extensionFolderPath = 'c:\\Users\\Syed Mohammed Jaffar\\Downloads\\darkscan-ai\\browser-extension';
  const packageCommand = 'powershell -ExecutionPolicy Bypass -File .\\scripts\\package-browser-extension.ps1 -BackendUrl https://your-service.onrender.com';

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(extensionFolderPath);
      toast.success('Extension folder path copied.');
    } catch (error) {
      console.error(error);
      toast.error('Unable to copy the extension folder path.');
    }
  };

  return (
    <div className="space-y-8 p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Browser Guard</h1>
          <p className="mt-1 text-muted-foreground">
            Consent-based browser extension setup for scanning visited URLs with DarkScan AI.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowSetupModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-90"
        >
          <FolderOpen className="h-5 w-5" />
          Open Local Setup Instructions
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-8 shadow-sm"
        >
          <div className="mb-6 flex items-center gap-4">
            <div className="rounded-2xl bg-primary/10 p-4">
              <Puzzle className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Install The Extension</h2>
              <p className="text-sm text-muted-foreground">
                Use the bundled Browser Guard extension from the <code>browser-extension</code> folder.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {chromiumSteps.map((step, index) => (
              <div key={step} className="flex gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {index + 1}
                </div>
                <p className="text-sm text-foreground">{step}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
            The easiest first target is Chromium-based browsers like Chrome, Edge, and Opera. Firefox support is partially prepared through WebExtension-compatible code and manifest metadata.
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-border bg-card p-8 shadow-sm"
        >
          <div className="mb-6 flex items-center gap-4">
            <div className="rounded-2xl bg-primary/10 p-4">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Connect And Enable</h2>
              <p className="text-sm text-muted-foreground">
                Sign in from the popup and choose how aggressively Browser Guard should react.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {connectSteps.map((step, index) => (
              <div key={step} className="flex gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {index + 1}
                </div>
                <p className="text-sm text-foreground">{step}</p>
              </div>
            ))}
          </div>
        </motion.section>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-4">
          <div className="rounded-2xl bg-primary/10 p-4">
            <Package className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Prepare It For Deployment</h2>
            <p className="text-sm text-muted-foreground">
              Package Browser Guard with your deployed DarkScan AI domain before you distribute it.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {deploymentSteps.map((step, index) => (
            <div key={step} className="flex gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {index + 1}
              </div>
              <p className="text-sm text-foreground">{step}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-background/70 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Packaging Command</p>
          <code className="block break-all text-sm text-foreground">{packageCommand}</code>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
          The packaging script creates a deploy-ready extension bundle in <code>browser-extension\dist</code> and pre-fills the popup with your hosted app URL.
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-3"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-bold">Distribution Options</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {distributionOptions.map((item) => (
              <div key={item} className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-sm text-foreground">{item}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
            Browsers do not let a normal website auto-install an extension for users. After deployment, the supported paths are manual install, browser-store distribution, or managed enterprise rollout.
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-bold">Visited URL Scanning</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            After the user explicitly enables Browser Guard, visited <code>http</code> and <code>https</code> tabs can be sent to the backend for analysis and stored as threat records.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-bold">Workspace-Safe Reporting</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Browser Guard visited-site scans stay inside the dashboard and Threat Reports instead of sending direct email for each browser visit.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3">
              <MonitorSmartphone className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-bold">Manual Scan</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Users can also click <span className="font-medium text-foreground">Scan Current Tab</span> inside the popup to perform an on-demand check without waiting for the automatic flow.
          </p>
        </motion.div>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24 }}
        className="rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-4">
          <div className="rounded-2xl bg-primary/10 p-4">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Behavior Summary</h2>
            <p className="text-sm text-muted-foreground">
              Browser Guard is designed to stay explicit and user-controlled.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {behaviors.map((item) => (
            <div key={item} className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-sm text-foreground">{item}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
          Browser Guard does not attach itself automatically to the browser. The user must install the extension manually, connect it to DarkScan AI, and enable scanning from the popup.
        </div>
      </motion.section>

      <AnimatePresence>
        {showSetupModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSetupModal(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-10 w-full max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-2xl"
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Local Extension Setup</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use this local project folder when Chrome, Edge, or Opera asks you to load the unpacked extension.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSetupModal(false)}
                  className="rounded-lg p-2 transition-colors hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-xl border border-border bg-background/70 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extension Folder Path</p>
                <code className="block break-all text-sm text-foreground">{extensionFolderPath}</code>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCopyPath}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <Copy className="h-4 w-4" />
                  Copy Folder Path
                </button>
              </div>

              <div className="mt-6 space-y-3">
                {chromiumSteps.map((step, index) => (
                  <div key={step} className="flex gap-3 rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {index + 1}
                    </div>
                    <p className="text-sm text-foreground">{step}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
                After the extension is loaded, open the Browser Guard popup, set the backend URL to your DarkScan AI app, sign in, and enable automatic tab scanning.
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
