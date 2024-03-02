# split-elm-bundle

This is a small command-line utility to split JavaScript bundles that the [Elm compiler](https://elm-lang.org) created into multiple ES modules.  

See it in action [on this page with example programs](https://marc-walter.info/posts/2024-03-02_elm-bundle-splitting/examples/).

## Usage

```sh
# Compile multiple Elm programs into one bundle
elm make --optimize --output=examples.js src/Clock.elm src/TextField.elm src/Quotes.elm

# split the bundle
npx split-elm-bundle examples.js
```

And then you can import a program e.g. like this:

```html
<main id="elm"></main>
<script type="module">
  import { Clock } from './examples.Clock.mjs';
  const app = Clock.init({ node: document.getElementById('elm') });
</script> 
```

See the [examples directory](https://github.com/marc136/split-elm-bundle/tree/main/examples/elm-lang-website-examples) for more information.


## CLI commands

```
Usage:
split-elm-bundle <options> <path/to/bundle.js>

With <options> one of
`--report=stdout` (default) will print log messages
`--report=json` will not print immediate logs, but only one JSON report in the end
`--dry-run` disables writing files to disk
```

### Example JSON report

From running `split-elm-bundle.mjs examples/elm-lang-website-examples/www/examples.js --report=json --dry-run`

```json
{
  "result": "split-programs-one-shared",
  "input": {
    "file": "examples/elm-lang-website-examples/www/examples.js",
    "sizes": { "raw": 253622, "gzip": 53453 }
  },
  "programs": [ "Animation", "TextField", "Quotes", "Mouse", "Cube", "Clock" ],
  "output": {
    "shared": {
      "file": "examples/elm-lang-website-examples/www/examples.shared.mjs",
      "sizes": { "raw": 117044, "gzip": 24391 }
    },
    "programs": [
      {
        "file": "examples/elm-lang-website-examples/www/examples.Animation.mjs",
        "sizes": { "raw": 7135, "gzip": 1514 }
      },
      {
        "file": "examples/elm-lang-website-examples/www/examples.TextField.mjs",
        "sizes": { "raw": 3783, "gzip": 1155 }
      },
      {
        "file": "examples/elm-lang-website-examples/www/examples.Quotes.mjs",
        "sizes": { "raw": 15273, "gzip": 3661 }
      },
      {
        "file": "examples/elm-lang-website-examples/www/examples.Mouse.mjs",
        "sizes": { "raw": 11375, "gzip": 2131 }
      },
      {
        "file": "examples/elm-lang-website-examples/www/examples.Cube.mjs",
        "sizes": { "raw": 40021, "gzip": 8833 }
      },
      {
        "file": "examples/elm-lang-website-examples/www/examples.Clock.mjs",
        "sizes": { "raw": 6791, "gzip": 1652 }
      }
    ]
  }
}
```