# Science Buzz V3 — complete deployment checklist

## A. GitHub repository

1. Create a repository, for example `science-buzz`.
2. Upload the V3 project files.
3. Enable GitHub Pages from **Settings → Pages**.
4. Select the `main` branch and root folder.
5. Open the generated Pages URL.

## B. GitHub App

Create a GitHub App under your GitHub account.

Recommended permission:

- Repository → Contents → Read and write

Install the app only on the Science Buzz repository.

GitHub's current documentation recommends GitHub Apps over OAuth Apps for new integrations because they provide fine-grained permissions and short-lived tokens.

## C. Cloudflare Worker

Create a Worker and KV namespace.

From `/worker`:

```bash
npm install -D wrangler
npx wrangler login
npx wrangler kv namespace create SCIENCE_BUZZ_SESSIONS
```

Copy the returned namespace ID into `worker/wrangler.toml`.

Set:

```toml
[vars]
GITHUB_APP_CLIENT_ID = "..."
ALLOWED_ORIGIN = "https://YOUR-USERNAME.github.io"
SESSION_TTL_SECONDS = "3600"
```

Then:

```bash
npx wrangler secret put GITHUB_APP_CLIENT_SECRET
npx wrangler secret put SESSION_SIGNING_SECRET
npx wrangler deploy
```

## D. GitHub App callback

If the Worker URL is:

`https://science-buzz-api.example.workers.dev`

the callback URL is:

`https://science-buzz-api.example.workers.dev/auth/callback`

Use that exact URL in the GitHub App settings.

## E. First login

Open:

`https://YOUR-USERNAME.github.io/science-buzz/admin/`

Enter the repository details and Worker URL.

Click **Sign in with GitHub**.

Authorize the Science Buzz Publisher app.

## F. Publish

1. Select date.
2. Select category.
3. Enter title.
4. Enter headline.
5. Enter explanation.
6. Enter source.
7. Select an image.
8. Click **Publish to GitHub**.

The Worker commits the image and `content.json`.

## Important production recommendation

The sample V3 lets any GitHub account that successfully authorizes and has sufficient repository access publish to the configured repository.

Before using it for a school/public production site, add an allowlist in the Worker, e.g.:

```js
const ALLOWED_ADMINS = ["your-github-username"];
```

and reject `/api/publish` if `s.login` is not in that list.

This makes the publishing endpoint an actual administrator-only CMS.
