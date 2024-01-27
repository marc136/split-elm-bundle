I want to explore code splitting with Elm

There are some concerns because the name mangling that Elm does during builds with `--optimize` are not stable.
Mario [wrote a gist comment](https://gist.github.com/supermario/629b4135657df19e6f4ff18bfcbbeb72) about it (Elm's live code inclusion), which is included below.

But for my approach, I only want to reduce the amount of code shipped to the browser on initial page load.  
I would still compile multiple Elm apps into one bundle, then convert it into an ESM.  
From that, I want to extract the individual apps into their own ESMs.

I want to look at two approaches: 

First, split the Elm apps `init` into individual ESM and have one ESM where ALL shared code is located.  
This is fine if we only have 2 apps, or if they are very similar, or if they are generally quite small.

But for e.g. 5 that could be wasteful: If we e.g. have 2 big ones that share a lot of code and 3 small ones that don't need the big portions that are shared by the 2 big ones.  
This leads to the second approach: Create granular files with shared code broken down for pairs of apps. But this won't be part of the initial MVP.

# Create one shared code module and multiple app modules

Steps:

1. Compile two Elm apps into one js file
2. Convert js to ESM
3. Detect which functions are used in which app
4. Copy shared code into one file and distinct code into the app files

---

# Is it useful

I think this is only useful in a project, where multiple Elm apps exist that don't need to directly share state. They can either communicate via ports or be completely separate from each other.

One example is a multi-page application where on every html page, another Elm program is executed.

If those programs do not share project-specific code, then only the Elm runtime and the used packages will be shared.

If they share code, the benefits will be even better.

So for this approach, about.html will load About.elm, which will also import Shared.elm.

Another approach where multiple Elm programs are used in the same browser tab (without reload), could import the other program dynamically/lazily.

But for this, the exports would need to change, so the `init()` fn of the other programs will first import the mjs file and then run the actual Elm init function.

# Usage and behavior
In the end, it will mimic the CLI of the Elm compiler.  
If you pass it one Elm program, its behavior will be very similar to [elm-esm](https://github.com/ChristophP/elm-esm).  
It is intended to be used with multiple Elm programs, where the Elm compiler's bundle can be split in multiple ways.

## Single files
If you convert a single file, the output is very similar to [elm-esm](https://github.com/ChristophP/elm-esm). It might be shorter (even significantly if not much of the Elm standard library or runtime is used), but will also take longer. I did not benchmark this, but elm-esm runs 5 regex matches on the whole file, and this tool starts an external process for tree-sitter and then traverses the AST in JS.  

But for a deployment, you should rather use elm-esm and terser (which will also remove all unused code).


```sh
$ ls -alh examples/from-aide/compiled/Static*
91K examples/from-aide/compiled/Static.js
29K examples/from-aide/compiled/Static.js.dce.mjs
```

Before
```html
<script src="./Program.js">
<script>
    const program = Elm.Program.init({ node: document.body })
    program.ports.outbound.subscribe(console.log)
</script>
```

Then you can use it like with [elm-esm](https://github.com/ChristophP/elm-esm) because it also exports an `Elm` object:
```html
<script type="module">
    import { Elm } from './Program.mjs'
    const program = Elm.Program.init({ node: document.body })
    program.ports.outbound.subscribe(console.log)
</script>
```

But I prefer to use either a default export
```html
<script type="module">
    import Elm from './Program.mjs'
    const program = Elm.Program.init({ node: document.body })
    program.ports.outbound.subscribe(console.log)
</script>
```

Or named exports for each `main`:
```html
<script type="module">
    import { Program } from './Program.mjs'
    const program = Program.init({ node: document.body })
    program.ports.outbound.subscribe(console.log)
</script>
```

## Multiple files

There are several modes how shared data is loaded and how the programs are loaded.  
I'm not yet sure which I actually want to explore.

### Mode 1: Separate bundles with a shared import
The first one generates one JS file per main program, and imports inside it the shared code.  
But every JS file only contains one main program.

npx elm-esm-split src/Program.elm src/Two.elm

Generates three files: `Program.mjs`, `Two.mjs` and `shared.mjs`

```js
// Content of Program.mjs
import * as shared from './shared.mjs'
...
export const Program = ...
export const Elm = { Program };
export default Elm;
```

Usage:
```html
<script type="module">
    import { Program } from './Program.mjs'
    const program = Program.init({ node: document.body })
    program.ports.outbound.subscribe(console.log)
</script>
```

### Mode 2: Combined bundles where each program is lazily imported
The second mode generates one bundle file that contains the shared code, and each main program is loaded only when needed.

```js
// Content of bundle.mjs
import * as shared from './shared.mjs'
...
export const Program = { init: async (params) => { 
    const { Program } = await import('./Program.mjs')
    Program.init(params)
}}
export const Two = { init: async (params) => { 
    const { Two } = await import('./Two.mjs')
    Two.init(params)
}}
export const Elm = { Program };
export default Elm;
```

```html
<script type="module">
    import Elm from './bundle.mjs'
    const program = Elm.Program.init({ node: document.body }).then(() => {
        console.log('Elm program was imported and initialized)
    })
    program.ports.outbound.subscribe(data => {
        if (data.action === 'init' && data.program) {
            Elm[data.program].init({ node: document.body }).then(() => {
                console.log(`Elm program ${data.program} was imported and initialized`)
            })
        }
    })
</script>
```


### Mode 3: Combined bundles where one program is imported directly and the others lazily

```js
// Content of Program.mjs
import * as shared from './shared.mjs'
...
export const Program = ...
export const Two = { init: async (params) => { 
    const { Two } = await import('./Two.mjs')
    Two.init(params)
}}
export const Elm = { Program };
export default Elm;
```

```html
<script type="module">
    import Elm from './Program.mjs'
    const program = Elm.Program.init({ node: document.body })
    program.ports.outbound.subscribe(data => {
        if (data.action === 'init' && data.program) {
            Elm[data.program].init({ node: document.body }).then(() => {
                console.log(`Elm program ${data.program} was imported and initialized`)
            })
        }
    })
</script>
```
