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


## SEO upgrade (static GitHub Pages)

This version includes:
- Static, crawlable article pages under `facts/<slug>-<date>/`.
- Static category landing pages under `category/<category>/`.
- `sitemap.xml` and `robots.txt` (admin path disallowed).
- Canonical URLs, Open Graph/Twitter metadata and Article JSON-LD on fact pages.
- Homepage WebSite JSON-LD and crawlable article links.
- Optional SEO title and SEO description fields in Content Studio.

### Deploy the website files
1. Extract the ZIP.
2. Upload/commit the updated website and admin files from the `ScienceBuzz` folder to the root of the existing `science-buzz` GitHub repository (not the outer folder itself).
3. **Do not blindly overwrite the live `content.json` or delete/replace the existing `images/` folder.** This ZIP's supplied `content.json` contains only three older sample facts and its images folder contains the two logos. Preserve the newer `content.json` and fact images already in your live repository.
4. Keep the existing GitHub Pages source and Cloudflare Worker secrets/bindings unchanged.
5. Allow GitHub Pages to finish deploying.
6. Test these URLs:
   - `https://iharshvardhansingh.github.io/science-buzz/robots.txt`
   - `https://iharshvardhansingh.github.io/science-buzz/sitemap.xml`
   - `https://iharshvardhansingh.github.io/science-buzz/facts/a-day-on-venus-is-longer-than-its-year-2026-09-13/`

### Automatic SEO generation and rebuild
The updated Worker generates/updates individual article pages, category pages, sitemap.xml, robots.txt and the homepage's crawlable article list after a successful fact publication.

To generate SEO pages for all facts already in the live repository (without publishing a new fact), deploy the updated website and Worker, open the admin Content Studio, sign in with GitHub, and click **Generate SEO pages**. This rebuilds the article pages and sitemap from the repository's current `content.json`.

To deploy the updated Worker, from the `worker` folder run:
```bash
npx wrangler deploy
```
This uses the existing Cloudflare Worker configuration. It does not require new secrets or bindings.

### Google Search Console
1. Add the URL-prefix property `https://iharshvardhansingh.github.io/science-buzz/`.
2. Verify ownership using the HTML tag method.
3. Add the verification meta tag to the homepage `<head>` in `index.html`, then commit and wait for GitHub Pages deployment.
4. Click Verify in Search Console.
5. Submit `sitemap.xml` (the sitemap path, not the full URL, if Search Console asks for a path).
6. Use URL Inspection to request indexing of the homepage and important article URLs.

### Notes
- GitHub Pages serves this site under `/science-buzz/`; do not change the base path to `/`.
- Existing historical image paths in content.json may refer to files that are not included in this ZIP. Add those image files or update their paths before expecting images to display.
- Search indexing and ranking are controlled by Google and are not guaranteed by submitting a sitemap.
