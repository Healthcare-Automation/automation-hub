"""Practice Story Engine research pipeline on Modal.

Runs the automation-hub Marketing pipeline (ingest → enrich → embed → cluster → score →
opportunities) from lib/marketingPipeline.ts with a generous time budget, instead of the
Vercel cron (which caps at 300s and could only chew through ~2 feeds per tick).

Also hosts run_instagram_content, the Mon/Wed/Fri Instagram content queue generator
(INSTAGRAM_QUEUE_BRIEF.md) — same image, same secret, calls
scripts/generate-instagram-content.ts instead.

Deploy (from automation-hub repo root):  modal deploy modal/marketing_research.py
Run once now:                             modal run modal/marketing_research.py
Run instagram function once now:          modal run modal/marketing_research.py::run_instagram_content
Secrets: Modal secret `marketing-research` with DATABASE_URL, OPENAI_API_KEY (+ optional OPENAI_MODEL).
"""
from pathlib import Path
import subprocess
import modal

_repo = Path(__file__).resolve().parent.parent

# Node image with only the runtime deps the pipeline touches (postgres, zod, tsx, dotenv,
# playwright-core for the carousel slide renderer — see lib/marketing/slideRenderer.ts).
# lib/, scripts/, and assets/fonts/ are added at build time; tsconfig for the @/ alias
# resolution. Chromium (not the Node playwright-core package's own bundled download, which
# npm ci --omit=dev skips) comes from Debian's chromium package — smaller and avoids
# playwright's separate browser-download step; slideRenderer.ts's MARKETING_CHROME_PATH env
# var points at it explicitly rather than relying on playwright-core's own resolution.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "curl", "ca-certificates",
        # Chromium + the shared libs it needs headless (same set Playwright's own
        # install-deps script pulls for Debian slim images).
        "chromium",
        "fonts-liberation",
        "libnss3", "libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libdrm2",
        "libxkbcommon0", "libxcomposite1", "libxdamage1", "libxfixes3", "libxrandr2",
        "libgbm1", "libasound2", "libpango-1.0-0", "libpangocairo-1.0-0", "libcairo2",
    )
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        "mkdir -p /app",
    )
    .add_local_file(_repo / "package.json", "/app/package.json", copy=True)
    .add_local_file(_repo / "package-lock.json", "/app/package-lock.json", copy=True)
    .run_commands("cd /app && npm ci --omit=dev --ignore-scripts && npm i --no-save tsx@4 dotenv@17 2>&1 | tail -2")
    .add_local_file(_repo / "tsconfig.json", "/app/tsconfig.json")
    .add_local_dir(_repo / "lib", "/app/lib")
    .add_local_dir(_repo / "scripts", "/app/scripts")
    .add_local_dir(_repo / "assets", "/app/assets")
)

# Debian's chromium package installs to this path — passed to slideRenderer.ts via
# MARKETING_CHROME_PATH so it doesn't have to guess (it defaults to /usr/bin/google-chrome,
# which doesn't exist in this image).
CHROME_PATH = "/usr/bin/chromium"

app = modal.App("marketing-research")


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("marketing-research")],
    timeout=30 * 60,
    schedule=modal.Cron("0 */6 * * *"),  # every 6h UTC, matches the retired Vercel cron
)
def run_research(time_budget_ms: int = 20 * 60 * 1000) -> str:
    import os

    env = dict(os.environ)
    env["MARKETING_TIME_BUDGET_MS"] = str(time_budget_ms)
    env["MARKETING_TRIGGERED_BY"] = "modal"
    proc = subprocess.run(
        ["npx", "tsx", "scripts/research-marketing.ts"],
        cwd="/app",
        env=env,
        capture_output=True,
        text=True,
        timeout=29 * 60,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    print(out[-6000:])
    if proc.returncode != 0:
        raise RuntimeError(f"research-marketing exited {proc.returncode}")
    return out[-2000:]


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("marketing-research")],
    timeout=12 * 60,
    schedule=modal.Cron("0 13 * * 1,3,5"),  # Mon/Wed/Fri 13:00 UTC — INSTAGRAM_QUEUE_BRIEF.md cadence
)
def run_instagram_content() -> str:
    import os

    env = dict(os.environ)
    # slideRenderer.ts's chromeExecutablePath() default (/usr/bin/google-chrome) doesn't
    # exist in this image — Debian's chromium package installs to CHROME_PATH instead. A
    # 3-4 slide carousel render adds real time over the old single gpt-image-1 call, hence
    # the bumped timeout above (was 10 min for one image call; 12 min covers research +
    # synthesis + up to 4 local Chromium launches).
    env["MARKETING_CHROME_PATH"] = CHROME_PATH
    proc = subprocess.run(
        ["npx", "tsx", "scripts/generate-instagram-content.ts"],
        cwd="/app",
        env=env,
        capture_output=True,
        text=True,
        timeout=11 * 60,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    print(out[-6000:])
    if proc.returncode != 0:
        raise RuntimeError(f"generate-instagram-content exited {proc.returncode}")
    return out[-2000:]


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("marketing-research")],
    timeout=8 * 60,
    schedule=modal.Cron("0 6 * * 1"),  # Mondays 06:00 UTC — well ahead of the Mon 13:00 Instagram run
)
def run_refresh_reddit_engagement() -> str:
    """Weekly refresh of marketing_reddit_engagement (Sean's feedback, 2026-09-09): real
    upvote/comment counts from a curated list of subreddits, via Apify. Deliberately weekly,
    not per Instagram run — the underlying data barely moves day to day and this is real
    Apify usage cost (see lib/marketing/redditEngagement.ts for the cost breakdown, well
    under Apify's $5/mo free-tier cap at this cadence). Requires the marketing-research
    Modal secret to also carry APIFY_TOKEN — see .env.local for the format.
    """
    import os

    proc = subprocess.run(
        ["npx", "tsx", "scripts/refresh-reddit-engagement.ts"],
        cwd="/app",
        env=dict(os.environ),
        capture_output=True,
        text=True,
        timeout=7 * 60,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    print(out[-4000:])
    if proc.returncode != 0:
        raise RuntimeError(f"refresh-reddit-engagement exited {proc.returncode}")
    return out[-2000:]


@app.local_entrypoint()
def main():
    print(run_research.remote())
