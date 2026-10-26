/** Mobile browsers may discard one of two downloads from the same action. */
export function needsArchive(device = navigator) {
  return (
    /Android|iPhone|iPad|iPod/i.test(device.userAgent || "") ||
    (device.platform === "MacIntel" && device.maxTouchPoints > 1)
  );
}
let engine;
function loadZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!engine)
    engine = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./vendor/jszip.min.js";
      script.onload = () =>
        window.JSZip
          ? resolve(window.JSZip)
          : reject(Error("ZIP engine not initialized."));
      script.onerror = () => {
        script.remove();
        reject(Error("ZIP engine unavailable. Reopen the app online."));
      };
      document.head.append(script);
    }).catch((error) => {
      engine = null;
      throw error;
    });
  return engine;
}
function bytes(blob) {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error("Unable to prepare the download."));
    reader.readAsArrayBuffer(blob);
  });
}
export async function createArchive(files) {
  const JSZip = await loadZip();
  const archive = new JSZip();
  for (const { name, blob } of files) archive.file(name, await bytes(blob));
  return archive.generateAsync({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
    compressionOptions: { level: 3 },
  });
}
