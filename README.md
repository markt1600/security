# The Watch · marktan.ai

Private camera journal for **https://security.marktan.ai**, styled to match The Daily at marktan.ai. Next.js on Vercel; footage stays in a **private Vercel Blob store**, never GitHub.

## What is included

- Latest 10 motion events, photo/video switch, video seeking, Singapore timestamps, responsive gallery, refresh every 30 seconds while visible.
- Server-side owner authorization on the page, listing, session check, and every media request. No public media redirects or client-side credentials.
- Shared Google sign-in from marktan.ai, restricted to `markh.tan@gmail.com`.
- A Windows-compatible Node uploader that watches completed photo/MP4 bundles, retries after connectivity failures, publishes the gallery only after both files upload, and cleans up older cloud media after a 10-minute grace period. Local recordings are never deleted by this uploader.

**The webcam motion recorder itself is a separate component and is not installed or started by this repository.** Its output must follow the bundle contract below. The page is a recordings viewer, not a live webcam stream or recorder-health monitor.

## Vercel setup

1. Import `markt1600/security`; framework **Next.js**, Node **22 or newer**, build `npm run build`, normal Next.js output. Assign `security.marktan.ai`.
2. Add a **private** Blob store dedicated to security and connect it to this project. It supplies `BLOB_READ_WRITE_TOKEN`. Public stores are deliberately unsupported.
3. Generate a fresh random secret (at least 32 characters); set **the identical `SECURITY_SSO_SECRET`** in the **security** and **mainpage** Vercel projects. Mark it sensitive. Do not reuse the existing dashboard/admin secrets. Do not put this value in GitHub or any `NEXT_PUBLIC_` variable.
4. Deploy the companion `mainpage` change (`api/_camera-session.js`, `api/login.js`, the logout change in `index.html`). Redeploy both projects after their variables are saved.
5. Refresh marktan.ai. Its existing full Google owner session now issues `__Secure-mt_camera` for `.marktan.ai`. Open security.marktan.ai; no second Google sign-in is needed.

### Shared sign-in design

The shared cookie is Secure, HttpOnly, SameSite=Lax and expires after seven days at most (never later than the mainpage session used to issue it). Its signed payload is `camera:markh.tan@gmail.com` and uses a dedicated HMAC key. The existing `specials:` cookie cannot unlock footage or upgrade into a camera session. Camera tokens cannot unlock dashboard administration. The raw dashboard owner token is never sent to security.

Signing out on The Daily removes the camera cookie in that browser. The viewer checks authorization again on refresh and on every media request. An already downloaded image or buffered video cannot be recalled. Other browsers remain signed in until they sign out or expire. Rotating the shared key on both projects invalidates all camera sessions.

This requires `security.marktan.ai`: a `*.vercel.app` preview cannot receive a `.marktan.ai` cookie and stays locked. All sibling subdomain servers receive domain cookies, so only trusted applications should be hosted under marktan.ai. No security-sensitive value is readable by frontend JavaScript.

## Automatic uploads from the camera PC

Requires Node.js 22+. In this repository:

```powershell
npm ci
Copy-Item .env.uploader.example .env.uploader
```

Edit `.env.uploader` locally with the dedicated private-store token and your recordings folder. Suggested folder:

`C:\Users\markh\Documents\Codex\CameraMonitor\recordings`

Run one uploader (it holds a local process lock):

```powershell
npm run upload
# Or process the current batch and exit:
npm run upload -- --once
```

Uploads go directly from the PC to Blob using multipart transfer for MP4s, so clips do not pass through a Vercel Function upload-size limit. The token has store-wide read/write access: use a dedicated store, keep the token only on this trusted PC and in Vercel, and never commit `.env.uploader`.

For unattended use, create a Windows Task Scheduler task using `node.exe` as the program, arguments `--env-file=.env.uploader scripts/upload.mjs`, and this repository as **Start in**. Run at startup with restart-on-failure, no execution time limit, and no overlapping instances. The PC must remain powered and awake; the motion recorder needs its own startup/recovery task. Starting at user sign-in is simpler but leaves a gap after a reboot until sign-in.

### Recorder output contract

Place each finished detection in a date folder, e.g.:

```text
recordings/2026-09-16/14-32-08.jpg
recordings/2026-09-16/14-32-08.mp4
recordings/2026-09-16/14-32-08.event.json
```

Use a browser-compatible H.264 MP4 with `faststart`. The recorder should include 5 seconds before movement and 5 seconds after the last movement. The JSON is the **ready signal**: write it to a temporary file and rename it atomically to `.event.json` only after closing the JPG and MP4. Never modify a finalized bundle. Use a globally unique ID for every event.

```json
{
  "id": "20260916T063208Z_a13f67c9",
  "detectedAt": "2026-09-16T06:32:08.000Z",
  "camera": "C922 · Home",
  "durationSeconds": 18.4
}
```

The uploader scans up to three date-folder levels. It uploads the newest 10 finalized bundles after a long offline period, rather than the entire backlog. It accepts photos up to 20 MiB, clips up to 500 MiB and durations up to 10 minutes. Long continuous motion should be split by the recorder into bounded clips. It preserves local archives; configure local disk retention in the recorder separately.

### Storage and costs

`camera/v1/latest.json` is the small gallery index. Media lives under `camera/v1/events/<id>/`. Only the latest 10 are viewable; older cloud files are pruned after 10 minutes, with cleanup checked every five minutes while the uploader runs. Stopping the uploader pauses cleanup. Cloud retention is not a backup of the local archive.

Storage, upload operations, and playback bandwidth count toward your Vercel plan. Private playback streams through the authenticated app, so Function/transfer usage also applies. No subscription purchase or usage limit is configured by this repo. The app never sends private footage to public Blob URLs.

## Development and checks

```powershell
npm ci
npm test
npm run build
npm run dev
```

Without a valid shared session the page displays only the sign-in gate. Missing SSO secrets fail closed. An authorized user without storage configuration receives a retryable storage error, not fabricated detections or a false camera-online status. Tests cover owner/scope checks, tampering, expiry, fail-closed configuration, retention ordering, path validation, atomic upload ordering, and concurrent index updates.

Operational verification still requires deployed secrets, a connected private store, a genuine signed-in browser, and a finalized recorder bundle. No real camera footage is included in tests.
