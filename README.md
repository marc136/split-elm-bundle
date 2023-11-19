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

# Usage and behavior
In the end, it will mimic the CLI of the Elm compiler.  
If you pass it one Elm program, its behavior will be very similar to [elm-esm](https://github.com/ChristophP/elm-esm).  
It is intended to be used with multiple Elm programs, where the Elm compiler's bundle can be split in multiple ways.

## Single files
If you convert a single file, the output is very similar to [elm-esm](https://github.com/ChristophP/elm-esm). It might be shorter (even significantly if not much of the Elm standard library or runtime is used), but will also take longer. I did not benchmark this, but elm-esm runs 5 regex matches on the whole file, and this tool starts an external process for tree-sitter and then traverses the AST in JS.

```sh
$ ls -alh example/compiled/Static*
91K example/compiled/Static.js
29K example/compiled/Static.js.dce.mjs
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


---

# Notes

## Comparing gzipped size of file

```sh
gzip -c file.js | wc -c
```

## Live code inclusion (by Mario Rogic)

Mario's gist comment about dead code removal (live code inclusion) https://gist.github.com/supermario/629b4135657df19e6f4ff18bfcbbeb72

```md
The question of code-splitting in Elm comes up fairly routinely.

The apparent low-hanging-fruit of code-splitting with Elm's pure/immutable philosophy has led me to explore this a few times with my compiler work on [Lamdera](https://lamdera.com). 

Here are some of the challenges I've found:

### The impact of Elm's current live-code-inclusion (LCI?)

It's a little trickier than it looks because Elm's DCE is actually not DCE (dead code elimination) at all, it's LCI (live code inclusion).

At the JS output stage, the compiler recursively pulls in defs and subdefs for only the things that are actually part of the project as it writes out everything used by `main` down.

While crying "this is not DCE" might seem a little pedantic, it has a practical impact on code-splitting for which saying "DCE" wouldn't make any sense, so I'll call it "LCI" for the purpose of explaining further.

Elm's LCI has two practical impacts:

### 1. LCI's symbol ofuscation is not stable

The symbol obfuscation algorithm, which replaces things unnecessary for runtime, like `myCustomRecordFieldName` or `myMeaningfulFunctionName` with something like `r` or `aP` (starting at `a` and going upwards to `ZZZ`), happens alongside the live-code-including output process. 

This means you could reposition one function call in your project source, re-compile, and end up with a completely different obfuscation set in Javascript.

### 2. LCI's symbol obfuscation fingerprints potential code-split chunks uniquely

Because functions can depend on other functions, knowing the obfuscated name of those functions, especially the commonly re-used ones from core, is important – otherwise, how do you know what to call? 

Thus, due to the prior point, if you have a code-split segment, you now can't re-use that with any other project without also retaining some knowledge of what the symbol obfuscation mapping was. Any sub-segments cannot do so either, all the way down. 

So each code split segment would have a unique "fingerprint" of obfuscation making it's "just re-use it" utility problematic.

---

Perhaps with some effort these problems could be overcome (I've been thinking about whether it's possible to have some sort of more stable obfuscation algorithm), but this is what prevents code-splitting being low-hanging fruit as things stand today, AFAIK!
```