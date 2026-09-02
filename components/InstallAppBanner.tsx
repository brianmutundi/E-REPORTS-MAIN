"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "e-reports-install-dismissed";

export default function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure shouldn't block the app.
      });
    }

    const alreadyDismissed = sessionStorage.getItem(DISMISS_KEY) === "1";

    const handler = (e: Event) => {
      e.preventDefault();
      if (alreadyDismissed) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible || !deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setVisible(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="install-banner" role="dialog" aria-label="Install app">
      <div className="install-banner__icon">
        <Download size={18} />
      </div>
      <div className="install-banner__text">
        <strong>Install E-Reports</strong>
        <span>Add it to your home screen for quick access.</span>
      </div>
      <button
        type="button"
        className="install-banner__install"
        onClick={handleInstall}
      >
        Install
      </button>
      <button
        type="button"
        className="install-banner__close"
        aria-label="Dismiss"
        onClick={handleDismiss}
      >
        <X size={16} />
      </button>

      <style jsx>{`
        .install-banner {
          position: fixed;
          left: 16px;
          right: 16px;
          bottom: 16px;
          z-index: 50;
          display: flex;
          align-items: center;
          gap: 12px;
          max-width: 420px;
          margin: 0 auto;
          background: #0f172a;
          color: white;
          padding: 12px 14px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
          animation: install-banner-rise 0.3s ease forwards;
        }
        .install-banner__icon {
          flex-shrink: 0;
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: linear-gradient(135deg, #3b82f6, #10b981);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .install-banner__text {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }
        .install-banner__text strong {
          font-size: 13px;
          font-weight: 600;
        }
        .install-banner__text span {
          font-size: 12px;
          color: #cbd5e1;
        }
        .install-banner__install {
          flex-shrink: 0;
          background: #10b981;
          color: white;
          border: none;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .install-banner__install:hover {
          background: #059669;
        }
        .install-banner__close {
          flex-shrink: 0;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
        }
        .install-banner__close:hover {
          color: white;
        }
        @keyframes install-banner-rise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
