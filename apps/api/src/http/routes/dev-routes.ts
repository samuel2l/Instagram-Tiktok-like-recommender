import type { FastifyInstance } from "fastify";
import { z } from "zod";

const uploadPage = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reels Dev Upload</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #09090b;
        color: #f4f4f5;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
      }
      main {
        width: min(720px, 100%);
      }
      h1 {
        font-size: 28px;
        margin: 0 0 24px;
      }
      form, .result {
        border: 1px solid #27272a;
        background: #18181b;
        border-radius: 8px;
        padding: 20px;
      }
      label {
        display: grid;
        gap: 8px;
        margin-bottom: 16px;
        color: #d4d4d8;
      }
      input, textarea, select, button {
        font: inherit;
      }
      input, textarea, select {
        background: #09090b;
        color: #f4f4f5;
        border: 1px solid #3f3f46;
        border-radius: 6px;
        padding: 12px;
      }
      textarea {
        min-height: 96px;
        resize: vertical;
      }
      button {
        width: 100%;
        border: 0;
        border-radius: 6px;
        padding: 12px 16px;
        background: #ef4444;
        color: white;
        cursor: pointer;
        font-weight: 700;
      }
      button:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      .result {
        margin-top: 16px;
        display: none;
      }
      a {
        color: #fca5a5;
      }
      code {
        color: #fca5a5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Dev Upload</h1>
      <form id="upload-form">
        <label>
          Video file
          <input id="file" type="file" accept="video/*" required />
        </label>
        <label>
          Caption
          <textarea id="caption" maxlength="2200" placeholder="Caption"></textarea>
        </label>
        <label>
          Visibility
          <select id="visibility">
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </label>
        <button id="submit" type="submit">Upload Video</button>
      </form>
      <section id="result" class="result" aria-live="polite"></section>
    </main>

    <script>
      const form = document.querySelector("#upload-form");
      const fileInput = document.querySelector("#file");
      const captionInput = document.querySelector("#caption");
      const visibilityInput = document.querySelector("#visibility");
      const submitButton = document.querySelector("#submit");
      const result = document.querySelector("#result");

      function setResult(html) {
        result.style.display = "block";
        result.innerHTML = html;
      }

      function extensionFor(file) {
        const name = file.name || "upload.mp4";
        const ext = name.includes(".") ? name.split(".").pop() : "mp4";
        return ext || "mp4";
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const file = fileInput.files[0];
        if (!file) return;

        submitButton.disabled = true;
        setResult("Creating upload URL...");

        try {
          const uploadResponse = await fetch("/videos/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              caption: captionInput.value || undefined,
              contentType: file.type || "video/mp4",
              extension: extensionFor(file),
              visibility: visibilityInput.value
            })
          });

          if (!uploadResponse.ok) {
            throw new Error(await uploadResponse.text());
          }

          const upload = await uploadResponse.json();
          setResult("Uploading to R2...");

          const r2Response = await fetch(upload.uploadUrl, {
            method: upload.method,
            headers: { "Content-Type": file.type || "video/mp4" },
            body: file
          });

          if (!r2Response.ok) {
            throw new Error("R2 upload failed with status " + r2Response.status);
          }

          setResult("Starting processing...");

          const completeResponse = await fetch("/videos/" + upload.videoId + "/upload-complete", {
            method: "POST",
            credentials: "include"
          });

          if (!completeResponse.ok) {
            throw new Error(await completeResponse.text());
          }

          setResult(
            "Upload accepted. <a href=\"/dev/videos/" +
              upload.videoId +
              "\">Open processing page</a>"
          );
        } catch (error) {
          setResult("<strong>Upload failed</strong><br /><code>" + String(error.message || error) + "</code>");
        } finally {
          submitButton.disabled = false;
        }
      });
    </script>
  </body>
</html>`;

const playbackPage = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reels Dev Playback</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #09090b;
        color: #f4f4f5;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
      }
      main {
        width: min(520px, 100%);
      }
      video {
        width: 100%;
        max-height: 72vh;
        background: black;
        border-radius: 8px;
      }
      .status {
        margin-top: 16px;
        padding: 16px;
        border: 1px solid #27272a;
        background: #18181b;
        border-radius: 8px;
      }
      a {
        color: #fca5a5;
      }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
  </head>
  <body>
    <main>
      <video id="player" controls playsinline></video>
      <section id="status" class="status" aria-live="polite">Loading...</section>
    </main>
    <script>
      const videoId = location.pathname.split("/").pop();
      const player = document.querySelector("#player");
      const status = document.querySelector("#status");
      let loadedPlaybackUrl = null;

      function loadVideo(url) {
        if (loadedPlaybackUrl === url) return;
        loadedPlaybackUrl = url;

        if (player.canPlayType("application/vnd.apple.mpegurl")) {
          player.src = url;
          return;
        }

        if (window.Hls?.isSupported()) {
          const hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(player);
          return;
        }

        status.innerHTML = "This browser cannot play HLS. Open the playback URL directly: <a href=\"" + url + "\">playlist</a>";
      }

      async function refresh() {
        const response = await fetch("/videos/" + videoId + "/processing-status", {
          credentials: "include"
        });

        if (!response.ok) {
          status.textContent = await response.text();
          return;
        }

        const data = await response.json();
        const video = data.video;

        if (video.status === "ready" && video.playbackUrl) {
          status.innerHTML = "Ready. Playback URL: <a href=\"" + video.playbackUrl + "\">master.m3u8</a>";
          loadVideo(video.playbackUrl);
          return;
        }

        status.textContent = "Status: " + video.status + ". Waiting for worker...";
        setTimeout(refresh, 2500);
      }

      refresh().catch((error) => {
        status.textContent = String(error.message || error);
      });
    </script>
  </body>
</html>`;

export async function registerDevRoutes(app: FastifyInstance) {
  app.get("/dev/upload", async (_request, reply) => {
    return reply.type("text/html").send(uploadPage);
  });

  app.get("/dev/videos/:id", async (request, reply) => {
    z.object({ id: z.string().uuid() }).parse(request.params);
    return reply.type("text/html").send(playbackPage);
  });
}
