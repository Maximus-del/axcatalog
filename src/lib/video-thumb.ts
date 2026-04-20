// Mobile-first. Test at 375px before merging.
//
// Extracts a thumbnail (JPEG Blob) from the first frame of an uploaded
// video file using a hidden <video> + <canvas>. Returns null if the
// browser can't decode (rare codec, corrupt file). Caller should treat
// a null result as "skip thumbnail" — don't block the upload.

export async function extractFirstFrame(
  file: File,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<{ blob: Blob; width: number; height: number; durationSec: number } | null> {
  const maxWidth = opts.maxWidth ?? 800;
  const quality = opts.quality ?? 0.82;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* no-op */
      }
    };

    video.addEventListener(
      "error",
      () => {
        cleanup();
        resolve(null);
      },
      { once: true },
    );

    video.addEventListener(
      "loadedmetadata",
      () => {
        // Seek a hair past 0 — some codecs render a black frame at 0.
        try {
          video.currentTime = Math.min(0.1, (video.duration || 1) / 10);
        } catch {
          cleanup();
          resolve(null);
        }
      },
      { once: true },
    );

    video.addEventListener(
      "seeked",
      () => {
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) {
            cleanup();
            resolve(null);
            return;
          }
          const scale = Math.min(1, maxWidth / w);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            cleanup();
            resolve(null);
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              cleanup();
              if (!blob) resolve(null);
              else
                resolve({
                  blob,
                  width: canvas.width,
                  height: canvas.height,
                  durationSec: Math.round(video.duration || 0),
                });
            },
            "image/jpeg",
            quality,
          );
        } catch {
          cleanup();
          resolve(null);
        }
      },
      { once: true },
    );
  });
}
