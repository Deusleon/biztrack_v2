import { useEffect, useState } from "react";
import { canInstall, isStandalone, promptInstall } from "../utils/pwa";

/** Settings → General: use BizTrack as an app (its own window and icon) instead of a browser tab. */
export default function InstallAppCard() {
  const [installable, setInstallable] = useState(canInstall());
  const [standalone] = useState(isStandalone());
  const [result, setResult] = useState("");

  useEffect(() => {
    const on = (e) => setInstallable(Boolean(e.detail?.available));
    window.addEventListener("biztrack:pwa-installable", on);
    return () => window.removeEventListener("biztrack:pwa-installable", on);
  }, []);

  const install = async () => {
    const outcome = await promptInstall();
    setResult(outcome === "accepted" ? "Installing…" : "");
  };

  return (
    <div className="mt-8 border-t border-gray-200 pt-6 text-left">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Use BizTrack as an app</h3>
      {standalone ? (
        <p className="text-sm text-gray-600">You are already using BizTrack as an installed app.</p>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">
            Install BizTrack to open it from your desktop or home screen in its own window, like any other program. It still needs
            an internet connection for business data, and it updates itself.
          </p>
          {installable ? (
            <button onClick={install} className="bg-primary text-white text-sm px-5 py-2.5 rounded hover:opacity-90">Install BizTrack</button>
          ) : (
            <div className="text-xs text-gray-500 leading-relaxed space-y-2">
              <p><span className="font-medium text-gray-700">Android (Chrome, Edge, Samsung Internet):</span> open the browser menu (⋮) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
              <p><span className="font-medium text-gray-700">iPhone or iPad:</span> in Safari tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, then <strong>Add</strong>. (An installed iPhone app has no reload button: pull the page down from the top to reload it.)</p>
              <p><span className="font-medium text-gray-700">Computer (Chrome or Edge):</span> use the install icon at the right end of the address bar, or the browser menu → <strong>Install BizTrack</strong>.</p>
            </div>
          )}
          {result && <p className="text-xs text-gray-500 mt-2">{result}</p>}
        </>
      )}
    </div>
  );
}
