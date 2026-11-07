import { useEffect, useState } from "react";
import { applyUpdate } from "../utils/pwa";

/**
 * Two small notices for the installed/offline app, shown at the bottom of the screen:
 *   - a new version is ready (reloading is the person's choice, never forced mid-task);
 *   - there is no internet connection.
 */
export default function PwaStatus() {
  const [updateReady, setUpdateReady] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const onUpdate = () => setUpdateReady(true);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("biztrack:pwa-update", onUpdate);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("biztrack:pwa-update", onUpdate);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online && !updateReady) return null;
  return (
    <div className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-[60] space-y-2 print:hidden text-left">
      {!online && (
        <div className="bg-gray-900 text-white text-sm rounded shadow-lg px-4 py-3" role="status">
          You are offline. BizTrack needs an internet connection to load and save business data.
        </div>
      )}
      {updateReady && (
        <div className="bg-white border border-gray-200 text-gray-800 text-sm rounded shadow-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2 gap-3" role="status">
          <span>A new version of BizTrack is ready.</span>
          <button onClick={applyUpdate} className="bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded hover:opacity-90">Reload</button>
        </div>
      )}
    </div>
  );
}
