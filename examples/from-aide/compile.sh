#!/bin/env sh

echo $PWD

elm make src/Static.elm --output compiled/Static.js
elm make src/Static.elm --output compiled/Static.debug.js --debug
elm make src/Static.elm --output compiled/Static.optimize.js --optimize

elm make src/BrowserSandbox.elm --output compiled/BrowserSandbox.js
elm make src/BrowserSandbox.elm --output compiled/BrowserSandbox.debug.js --debug
elm make src/BrowserSandbox.elm --output compiled/BrowserSandbox.optimize.js --optimize

elm make src/BrowserElement.elm --output compiled/BrowserElement.js
elm make src/BrowserElement.elm --output compiled/BrowserElement.debug.js --debug
elm make src/BrowserElement.elm --output compiled/BrowserElement.optimize.js --optimize

elm make src/BrowserDocument.elm --output compiled/BrowserDocument.js
elm make src/BrowserDocument.elm --output compiled/BrowserDocument.debug.js --debug

elm make src/BrowserApplication.elm --output compiled/BrowserApplication.js
elm make src/BrowserApplication.elm --output compiled/BrowserApplication.debug.js --debug

elm make src/BrowserSandbox.elm src/BrowserElement.elm --output compiled/BrowserSandbox+BrowserElement.js
elm make src/BrowserSandbox.elm src/BrowserElement.elm --output compiled/BrowserSandbox+BrowserElement.debug.js --debug

elm make src/BrowserSandbox.elm src/BrowserElement.elm src/IncrementWithTask.elm --output compiled/BrowserSandbox+BrowserElement+IncrementWithTask.js
elm make src/BrowserSandbox.elm src/BrowserElement.elm src/IncrementWithTask.elm --output compiled/BrowserSandbox+BrowserElement+IncrementWithTask.debug.js --debug

