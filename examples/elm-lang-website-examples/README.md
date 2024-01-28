Copied from https://github.com/elm/elm-lang.org/ all Elm code in `src/` was written by Evan Czaplicki who owns the copyright on it.

I only added made the examples directly compilable and added html files.

Execute `./build.sh` or run the following:

```sh
elm make --optimize --output=www/examples.js src/Animation.elm src/Clock.elm src/TextField.elm src/Quotes.elm

> node ../../bin/split-elm-bundle.mjs www/examples.js
Working in directory www
Read examples.js 181.9KiB (38.9KiB gzip)
Extracting Animation
Extracting TextField
Extracting Quotes
Extracting Clock
Wrote examples.TextField.mjs 3789B (1160B gzip)
Wrote examples.Clock.mjs 6.8KiB (1656B gzip)
Wrote examples.Quotes.mjs 15.5KiB (3683B gzip)
Wrote examples.Animation.mjs 26.4KiB (4811B gzip)
Wrote examples.shared.mjs 97.2KiB (21.2KiB gzip)
```

Then host the `www` directory with an arbitrary static file server and open the `index.html` file.

E.g. `caddy file-server --root www` with [caddy](https://caddyserver.com/docs/command-line#caddy-file-server).

