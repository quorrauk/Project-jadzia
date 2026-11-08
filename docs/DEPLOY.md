# Deploy (GitHub Pages)

One-time setup:

1. Open the repo on github.com, click **Settings**.
2. In the left sidebar click **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**. (The `pages.yml` workflow does the build; there is no branch to pick.)
4. Click the **Actions** tab. Open the latest **Deploy to GitHub Pages** run. It should be green.
5. Open https://quorrauk.github.io/Project-jadzia/ (also in `config/app.config.json` as `github.pagesUrl`).

Every push to `main` redeploys. If the first run failed with a Pages "not enabled" error, do steps 1-3 then click **Re-run all jobs** on that run.
