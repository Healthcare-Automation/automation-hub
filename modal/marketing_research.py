"""Practice Story Engine research pipeline on Modal.

Runs the automation-hub Marketing pipeline (ingest → enrich → embed → cluster → score →
opportunities) from lib/marketingPipeline.ts with a generous time budget, instead of the
Vercel cron (which caps at 300s and could only chew through ~2 feeds per tick).

Deploy (from automation-hub repo root):  modal deploy modal/marketing_research.py
Run once now:                             modal run modal/marketing_research.py
Secrets: Modal secret `marketing-research` with DATABASE_URL, OPENAI_API_KEY (+ optional OPENAI_MODEL).
"""
from pathlib import Path
import subprocess
import modal

_repo = Path(__file__).resolve().parent.parent

# Node image with only the runtime deps the pipeline touches (postgres, zod, tsx, dotenv).
# lib/ and scripts/ are added at build time; tsconfig for the @/ alias resolution.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl", "ca-certificates")
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
)

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


@app.local_entrypoint()
def main():
    print(run_research.remote())
