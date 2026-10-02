import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { env } from "./config.js";
import { uploadProcessedObject } from "./r2.js";

type ProbeStream = {
  codec_type?: string;
  width?: number;
  height?: number;
};

type ProbeOutput = {
  streams?: ProbeStream[];
  format?: {
    duration?: string;
  };
};

export type Rendition = {
  name: string;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
};

const renditions: Rendition[] = [
  { name: "1080p", height: 1080, videoBitrate: "5000k", audioBitrate: "128k" },
  { name: "720p", height: 720, videoBitrate: "2800k", audioBitrate: "128k" },
  { name: "480p", height: 480, videoBitrate: "1400k", audioBitrate: "96k" },
  { name: "360p", height: 360, videoBitrate: "800k", audioBitrate: "96k" }
];

export type MediaInfo = {
  durationMs: number | null;
  width: number | null;
  height: number | null;
};

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
  });
}

function readCommand(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
  });
}

export async function probeVideo(sourcePath: string): Promise<MediaInfo> {
  const output = await readCommand(env.FFPROBE_PATH, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    sourcePath
  ]);
  const parsed = JSON.parse(output) as ProbeOutput;
  const videoStream = parsed.streams?.find(
    (stream) => stream.codec_type === "video"
  );
  const durationSeconds = parsed.format?.duration
    ? Number(parsed.format.duration)
    : null;

  return {
    durationMs:
      durationSeconds && Number.isFinite(durationSeconds)
        ? Math.round(durationSeconds * 1000)
        : null,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null
  };
}

export async function transcodeToHls(input: {
  sourcePath: string;
  outputDir: string;
  mediaInfo: MediaInfo;
}) {
  await mkdir(input.outputDir, { recursive: true });

  const eligibleRenditions = renditions.filter((rendition) => {
    if (!input.mediaInfo.height) {
      return rendition.height <= 720;
    }

    return rendition.height <= input.mediaInfo.height;
  });
  const selectedRenditions =
    eligibleRenditions.length > 0
      ? eligibleRenditions
      : [renditions[renditions.length - 1]];
  const variantLines: string[] = ["#EXTM3U", "#EXT-X-VERSION:3"];

  for (const rendition of selectedRenditions) {
    const renditionDir = path.join(input.outputDir, rendition.name);
    await mkdir(renditionDir, { recursive: true });

    await runCommand(env.FFMPEG_PATH, [
      "-y",
      "-i",
      input.sourcePath,
      "-vf",
      `scale=-2:${rendition.height}`,
      "-c:v",
      "h264",
      "-profile:v",
      "main",
      "-preset",
      "veryfast",
      "-b:v",
      rendition.videoBitrate,
      "-maxrate",
      rendition.videoBitrate,
      "-bufsize",
      `${Number.parseInt(rendition.videoBitrate, 10) * 2}k`,
      "-c:a",
      "aac",
      "-b:a",
      rendition.audioBitrate,
      "-ac",
      "2",
      "-hls_time",
      "4",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      path.join(renditionDir, "segment-%05d.ts"),
      path.join(renditionDir, "index.m3u8")
    ]);

    const bandwidth =
      Number.parseInt(rendition.videoBitrate, 10) * 1000 +
      Number.parseInt(rendition.audioBitrate, 10) * 1000;
    variantLines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${Math.round(
        (rendition.height * 9) / 16
      )}x${rendition.height}`,
      `${rendition.name}/index.m3u8`
    );
  }

  return {
    renditions: selectedRenditions,
    masterPlaylist: `${variantLines.join("\n")}\n`
  };
}

export async function createThumbnail(input: {
  sourcePath: string;
  outputPath: string;
}) {
  await runCommand(env.FFMPEG_PATH, [
    "-y",
    "-ss",
    "00:00:01",
    "-i",
    input.sourcePath,
    "-frames:v",
    "1",
    "-vf",
    "scale=720:-2",
    input.outputPath
  ]);
}

function getContentType(filePath: string) {
  if (filePath.endsWith(".m3u8")) {
    return "application/vnd.apple.mpegurl";
  }

  if (filePath.endsWith(".ts")) {
    return "video/mp2t";
  }

  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return listFiles(fullPath);
      }

      return [fullPath];
    })
  );

  return files.flat();
}

export async function uploadDirectoryToR2(input: {
  outputDir: string;
  keyPrefix: string;
}) {
  const files = await listFiles(input.outputDir);

  for (const filePath of files) {
    const relativePath = path.relative(input.outputDir, filePath);
    const objectKey = `${input.keyPrefix}/${relativePath}`;
    await uploadProcessedObject({
      objectKey,
      filePath,
      contentType: getContentType(filePath)
    });
  }
}
