// FILE PATH: frontend/src/components/InstallBanner.jsx
import { useEffect, useState } from "react";
import { canInstall, isStandalone, promptInstall } from "../utils/pwa";
import Icon from "./ui/Icon";

const KEY = "biztrack-install-banner-dismissed";
const QUIET_DAYS = 14; // after "no thanks", don't ask again for two weeks
const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * A slim bar on phones and tablets that are not using the installed app yet.
 *   Android (Chrome, Edge, Samsung Internet): one tap on Install opens the system's install dialog.
 *   iPhone / iPad: there is no install dialog on iOS, so the steps are shown (Share → Add to Home Screen).
 * Parents and students use phones and cannot open Settings, so this is where they find out they can install the app.
 */
export default function InstallBanner() {
  const [installable, setInstallable] = useState(canInstall());
  const [hidden, setHidden] = useState(() => Date.now() - Number(localStorage.getItem(KEY) || 0) < QUIET_DAYS * 86400000);
  const [steps, setSteps] = useState(false);
  const ios = isIos();

  useEffect(() => {
    const on = (e) => setInstallable(Boolean(e.detail?.available));
    window.addEventListener("biztrack:pwa-installable", on);
    return () => window.removeEventListener("biztrack:pwa-installable", on);
  }, []);

  const touch = window.matchMedia?.("(pointer: coarse)").matches && window.matchMedia("(max-width: 1023px)").matches;
  if (isStandalone() || hidden || !touch || !(installable || ios)) return null;

  const dismiss = () => { localStorage.setItem(KEY, String(Date.now())); setHidden(true); };
  const install = async () => {
    if (ios) { setSteps(true); return; }
    const outcome = await promptInstall();
    if (outcome === "accepted") dismiss();
  };

  return (
    <>
      <div className="print:hidden bg-primary-5 border-b border-gray-200 px-3 py-2 flex items-center gap-3 text-left">
        <Icon name="download" className="w-5 h-5 text-primary" />
        <p className="flex-1 text-sm text-gray-700 leading-snug">Install BizTrack on your {ios ? "iPhone or iPad" : "phone"} for one-tap access.</p>
        <button type="button" onClick={install} className="bg-primary text-white text-sm px-3 py-1.5 rounded whitespace-nowrap">Install</button>
        <button type="button" onClick={dismiss} aria-label="Not now" className="p-1 text-gray-500"><Icon name="x" className="w-5 h-5" /></button>
      </div>

      {steps && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setSteps(false)}>
          <div className="w-full bg-white rounded-t-xl p-5 space-y-4 text-left" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Install BizTrack on your iPhone</h3>
              <button type="button" onClick={() => setSteps(false)} aria-label="Close" className="p-1 text-gray-500"><Icon name="x" className="w-5 h-5" /></button>
            </div>
            <ol className="space-y-3 text-sm text-gray-700">
              <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center flex-shrink-0">1</span>
                <span>Tap the <strong>Share</strong> button
                  <svg className="inline w-5 h-5 mx-1 -mt-1 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2v-6a2 2 0 00-2-2h-2M12 3v12m0-12l-3.5 3.5M12 3l3.5 3.5" /></svg>
                  at the bottom of Safari (or at the top on an iPad).</span></li>
              <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center flex-shrink-0">2</span>
                <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span></li>
              <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center flex-shrink-0">3</span>
                <span>Tap <strong>Add</strong>. BizTrack now opens from your home screen like any other app.</span></li>
            </ol>
            <p className="text-xs text-gray-500">Not seeing Add to Home Screen? Open this page in Safari first. To reload the app later, pull the page down from the top.</p>
            <button type="button" onClick={() => setSteps(false)} className="w-full bg-primary text-white rounded py-2.5 text-sm font-medium">Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
