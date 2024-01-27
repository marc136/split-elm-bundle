Aside: Something a little weird was happening with a trivial Elm application that was compiled with the time-traveling debugger enabled.  
In that case, the uglified code and the dce code are closer in size than the uglified and the dce'd and uglified code.

| size | gzipped | file |
|-|-|-|
| 274K | 55K | BrowserApplication.debug.js |
| 83K | 20K | BrowserApplication.debug.js.dce.mjs |
| 73K | 26K | BrowserApplication.debug.uglified.js |
| 48K | 13K | BrowserApplication.debug.js.dce.uglified.mjs |
| 27K | 11K | BrowserApplication.debug.js.dce.tersed.mjs |
| 21K | 8K | BrowserApplication.optimized.uglified.js |

The big size gap is mostly because the Elm compiler includes the full js kernel code even if it is not used in the debug build.  
And after my transformation only the live code is included.

Even the optimized and uglified code is only a little smaller than the DCE'd ESM code with debugger enabled.

But as I doubt anyone will deploy that to production, I chose to ignore it.


Reproduction steps:

```sh
cd examples/from-aide

elm make src/BrowserApplication.elm --debug --output compiled/BrowserApplication.debug.js

cd compiled

# Compress using only uglify-js, see https://discourse.elm-lang.org/t/what-i-ve-learned-about-minifying-elm-code/7632 for better options
npx uglify-js BrowserApplication.debug.js --compress 'pure_funcs=[F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9],pure_getters,unsafe_comps,unsafe' --mangle 'reserved=[F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9]' --output BrowserApplication.debug.uglified.js

# Generate DCE'd ESM
node ../bin/elm-dce-esm.mjs examples/from-aide/compiled/BrowserApplication.debug.js

# Compress with same settings
npx uglify-js BrowserApplication.debug.js.dce.mjs --compress 'pure_funcs=[F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9],pure_getters,unsafe_comps,unsafe' --mangle 'reserved=[F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9]' --output BrowserApplication.debug.js.dce.uglified.mjs

npx terser BrowserApplication.debug.js.dce.mjs --compress 'pure_funcs=[F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9],pure_getters,unsafe_comps,unsafe,unsafe_arrows' --ecma 2020 --module  --mangle 'reserved=[F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9]' --output BrowserApplication.debug.js.dce.tersed.mjs

# Print results
ls -alh BrowserApplication.debug.*
```
