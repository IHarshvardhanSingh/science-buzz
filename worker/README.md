# Science Buzz V3 — GitHub publishing Worker

This is the server-side component for the V3 Content Studio.

## Why a Worker?

GitHub's OAuth client secret must not be exposed in frontend JavaScript. The Worker performs OAuth code exchange and stores the GitHub access token in Cloudflare KV behind an HttpOnly session cookie.

GitHub recommends GitHub Apps over classic OAuth Apps because GitHub Apps support finer-grained permissions and short-lived tokens.

## 1. Create a GitHub App

In GitHub:

**Settings → Developer settings → GitHub Apps → New GitHub App**

Configure:

- App name: `Science Buzz Publisher`
- Homepage URL: your Science Buzz Pages URL
- Callback URL: `https://YOUR-WORKER.workers.dev/auth/callback`
- Repository permissions:
  - Contents: Read and write
- Install the App on the repository containing Science Buzz.

For the V3 implementation, enable user authorization / OAuth web flow for the GitHub App and record the App's Client ID and Client Secret.

## 2. Create Cloudflare KV

Create a KV namespace called something like `SCIENCE_BUZZ_SESSIONS`.

Copy its namespace ID into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_KV_NAMESPACE_ID"
```

## 3. Set Worker variables and secrets

Edit `wrangler.toml`:

- `GITHUB_APP_CLIENT_ID`
- `ALLOWED_ORIGIN`

Then set secrets:

```bash
npx wrangler secret put GITHUB_APP_CLIENT_SECRET
npx wrangler secret put SESSION_SIGNING_SECRET
```

Use a long random value for `SESSION_SIGNING_SECRET`.

## 4. Deploy

From this `worker` directory:

```bash
npm install -D wrangler
npx wrangler login
npx wrangler deploy
```

Copy the deployed Worker URL.

## 5. Configure the website

Open:

`https://YOUR-USERNAME.github.io/YOUR-REPO/admin/`

Enter:

- Repository owner
- Repository name
- Branch
- Worker URL

Click **Sign in with GitHub**.

## 6. Publishing

The Content Studio sends the fact and image to the Worker.

The Worker:

1. verifies the authenticated session;
2. reads the current `content.json`;
3. uploads/replaces the image under `images/`;
4. updates `content.json`;
5. creates GitHub commits;
6. GitHub Pages deploys the site.

The image and JSON operations are deliberately sequential because GitHub's Contents API warns that concurrent create/update/delete operations can conflict.

## Security

Never put these values in the GitHub Pages repository:

- GitHub App Client Secret
- GitHub access tokens
- Cloudflare Worker secret
- a GitHub Personal Access Token

For production, consider adding an admin allowlist (specific GitHub usernames), rate limiting, audit logging and CSRF protections.
