# split-elm-bundle

This is a small command-line utility to split JavaScript bundles that the [Elm compiler](https://elm-lang.org) created into multiple ES modules.  

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
