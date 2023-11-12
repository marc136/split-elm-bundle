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

---

# Notes

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