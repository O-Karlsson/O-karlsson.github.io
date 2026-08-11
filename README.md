# omarkarlsson.com

Source for my personal site — research portfolio, CV and publications.

**Live:** https://omarkarlsson.com/

## How it works

Plain static HTML, CSS and JavaScript served by GitHub Pages. No build step, no
package manager, no framework — edit a file, commit, push, and it deploys.

- `index.html` — the whole site; sections expand and collapse client-side
- `CV.md` — CV content, fetched and rendered at load time by
  [marked](https://github.com/markedjs/marked) (vendored in `offlineLib/`)
- `mysitescript.js` — section toggling, dashboard view switching, CV rendering
- `CNAME` — binds the apex domain; owned by this repo only

This is the GitHub Pages **user site**, so it serves the apex domain.

## The dashboards

Two data dashboards live in their own repositories and are served as project
sites under the same domain:

| Repo | URL |
|---|---|
| [CH2050_dash](https://github.com/O-Karlsson/CH2050_dash) | https://omarkarlsson.com/CH2050_dash/ |
| [CIH_dash](https://github.com/O-Karlsson/CIH_dash) | https://omarkarlsson.com/CIH_dash/ |

Neither has a `CNAME` file, and neither should get one. A GitHub Pages project
site with no custom domain of its own is served at `<user site domain>/<repo>`,
inheriting `omarkarlsson.com` from this repository automatically. Setting a
custom domain on either dashboard repo would make it claim the apex and break
routing for all three sites.
