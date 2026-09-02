"use client";

import { useEffect, useState } from "react";

interface SuccessToastProps {
  message: string;
  /** Controls visibility. If omitted, the toast shows itself on mount. */
  visible?: boolean;
  /** Called when the toast has finished auto-hiding. */
  onHide?: () => void;
  /** Auto-hide delay in ms. Defaults to 3000. Pass 0 to disable auto-hide. */
  duration?: number;
}

export default function SuccessToast({
  message,
  visible = true,
  onHide,
  duration = 3000,
}: SuccessToastProps) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    setShow(visible);
    if (!visible || duration === 0) return;

    const timer = setTimeout(() => {
      setShow(false);
      onHide?.();
    }, duration);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, message, duration]);

  if (!show) return null;

  return (
    <div className="success-toast" role="status" aria-live="polite">
      <svg
        className="success-toast__check"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#059669"
        strokeWidth="2.5"
      >
        <circle className="success-toast__circle" cx="12" cy="12" r="10" />
        <path className="success-toast__tick" d="M8 12l2.5 2.5L16 9" />
      </svg>
      <span>{message}</span>

      <style jsx>{`
        .success-toast {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: max-content;
          white-space: nowrap;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          border-left: 3px solid #059669;
          color: #065f46;
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
          overflow: hidden;
          animation: success-toast-drop 0.35s ease forwards;
        }

        .success-toast__circle {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          animation: success-toast-draw 0.5s ease forwards 0.15s;
        }

        .success-toast__tick {
          stroke-dasharray: 20;
          stroke-dashoffset: 20;
          animation: success-toast-draw 0.3s ease forwards 0.5s;
        }

        @keyframes success-toast-drop {
          0% {
            max-height: 0;
            opacity: 0;
            padding-top: 0;
            padding-bottom: 0;
          }
          100% {
            max-height: 40px;
            opacity: 1;
            padding-top: 8px;
            padding-bottom: 8px;
          }
        }

        @keyframes success-toast-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
